/**
 * ClawSwarm Channel Plugin — channel.ts
 *
 * Implements a WebSocket-based channel that connects OpenClaw to a ClawSwarm
 * multi-agent group chat server.
 *
 * Architecture:
 *   - OpenClaw connects to ClawSwarm at   ws://<serverUrl>/ws/agent
 *   - Authenticates with:                { type:"auth", token, agentName }
 *   - Receives messages when @-mentioned: { type:"message", ... }
 *   - Sends replies back via WS:          { type:"message", roomId, content }
 *   - Sends typing indicators:            { type:"typing",  roomId, status }
 *
 * Config keys (plugins.entries.clawswarm.accounts.<id>.config):
 *   serverUrl  – WebSocket base URL of the ClawSwarm API
 *   token      – ocs_xxx token from ClawSwarm admin panel
 *   agentName  – Display name of this OpenClaw instance
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import WebSocket from "ws";

// ─── Protocol types ──────────────────────────────────────────────────────────

interface CsAuthMsg {
  type: "auth";
  token: string;
  agentName: string;
}

interface CsContext {
  agentName: string;
  agentNickname: string;
  agentRole: string;
  agentSkills: string[];
  taskLabel: string;
  roomAgents: Array<{ name: string; nickname: string; role: string }>;
  taskHistory: Array<{
    id: string;
    from: string;
    fromType: "human" | "agent";
    content: string;
    timestamp: number;
  }>;
}

interface CsInboundMsg {
  type: "message";
  id: string;
  roomId: string;
  from: string;
  fromType: "human" | "agent";
  content: string;
  mentions: string[];
  timestamp: number;
  _context?: CsContext;
}

interface CsTypingMsg {
  type: "typing";
  from: string;
  roomId: string;
  status: "start" | "stop";
}

type CsServerMsg = CsInboundMsg | CsTypingMsg;

interface CsOutboundMessage {
  type: "message";
  roomId: string;
  content: string;
}

interface CsOutboundTyping {
  type: "typing";
  roomId: string;
  status: "start" | "stop";
}

// ─── Account config ──────────────────────────────────────────────────────────

export interface ClawSwarmAccountConfig {
  serverUrl: string;
  token: string;
  agentName: string;
}

// ─── Active connection state ─────────────────────────────────────────────────

interface ActiveConn {
  ws: WebSocket;
  config: ClawSwarmAccountConfig;
  roomId: string | null;
  terminated: boolean;
}

const activeConns = new Map<string, ActiveConn>();

// ─── WebSocket manager ───────────────────────────────────────────────────────

function startConnection(
  accountId: string,
  config: ClawSwarmAccountConfig,
  cfg: any,
  channelRuntime: any
): ActiveConn {
  const conn: ActiveConn = {
    ws: null as unknown as WebSocket,
    config,
    roomId: null,
    terminated: false,
  };

  let reconnectDelay = 1000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect(): void {
    if (conn.terminated) return;

    const wsUrl = `${config.serverUrl.replace(/\/$/, "")}/ws/agent`;
    const ws = new WebSocket(wsUrl);
    conn.ws = ws;

    ws.on("open", () => {
      reconnectDelay = 1000;
      const authMsg: CsAuthMsg = {
        type: "auth",
        token: config.token,
        agentName: config.agentName,
      };
      ws.send(JSON.stringify(authMsg));
    });

    ws.on("message", (raw: WebSocket.RawData) => {
      let msg: CsServerMsg;
      try {
        msg = JSON.parse(raw.toString()) as CsServerMsg;
      } catch {
        return;
      }
      if (msg.type === "message") {
        conn.roomId = msg.roomId;
        if (msg._context) {
          handleInbound(accountId, msg, cfg, channelRuntime, conn);
        }
      }
    });

    ws.on("close", () => {
      if (conn.terminated) return;
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        connect();
      }, reconnectDelay);
    });

    ws.on("error", (_err: Error) => {
    });
  }

  connect();

  (conn as any)._stop = () => {
    conn.terminated = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    conn.ws?.close();
  };

  return conn;
}

// ─── Inbound message handler ─────────────────────────────────────────────────

function handleInbound(
  accountId: string,
  msg: CsInboundMsg,
  cfg: any,
  channelRuntime: any,
  conn: ActiveConn
): void {
  const buildSessionKey = channelRuntime?.routing?.buildAgentSessionKey;
  const sessionKey = typeof buildSessionKey === "function"
    ? buildSessionKey({
        channel: "clawswarm",
        accountId,
        peer: { kind: "group", id: msg.roomId },
      })
    : `agent:main:clawswarm:group:${msg.roomId.toLowerCase()}`;

  const dispatch = channelRuntime?.reply?.dispatchReplyWithBufferedBlockDispatcher;

  if (typeof dispatch !== "function") {
    process.stderr.write(
      `[clawswarm] dispatchReplyWithBufferedBlockDispatcher not found. ` +
      `channelRuntime keys: ${Object.keys(channelRuntime ?? {}).join(",")}\n`
    );
    return;
  }

  const context = msg._context;

  const delegateMatch = msg.content.match(/(?:^|\n)\/delegate\s+@[^\s@,，。！？\\/]+\s+([\s\S]+)/imu);
  const discussMatch  = msg.content.match(/(?:^|\n)\/discuss\s+@[^\s@,，。！？\\/]+\s+([\s\S]+)/imu);
  const incomingMode: "delegate" | "discuss" | "mention" =
    delegateMatch ? "delegate" : discussMatch ? "discuss" : "mention";
  const effectiveBody = (delegateMatch ?? discussMatch)?.[1]?.trim() ?? msg.content;

  // Build a per-message session key so each @mention starts a clean session.
  // This avoids accumulated orphaned messages causing consecutive-user-turn 400s.
  const perMsgSessionKey = `${sessionKey}:${msg.id}`;

  // Inject task history via ExtraSystemPrompt to avoid OpenClaw trying to
  // reconstruct a messages array from InboundHistory (which can cause 400s).
  const historyLines: string[] = [];
  const priorHistory = (context?.taskHistory ?? []).filter((m) => m.id !== msg.id);
  if (priorHistory.length > 0) {
    historyLines.push("## Conversation history (most recent last)");
    for (const m of priorHistory) {
      const role = m.fromType === "agent" ? "Agent" : "Human";
      historyLines.push(`[${role}] ${m.from}: ${m.content}`);
    }
  }

  const untrustedContext: string[] = [];

  // Identity — must be first so the LLM knows who it is
  const selfName = context?.agentName ?? conn.config.agentName;
  const selfNickname = context?.agentNickname ?? '';
  const selfDisplay = selfNickname ? `${selfNickname} (@${selfName})` : `@${selfName}`;
  untrustedContext.push(
    `YOUR IDENTITY: You are ${selfDisplay}. This is your name in this group chat. Do NOT introduce yourself as anyone else.`
  );

  const scopeText = [
    `Task scope: ${context?.taskLabel ? `"${context.taskLabel}"` : "(no label)"}`,
    "Only use the conversation history provided as context. Do not reference prior sessions or unrelated memories.",
  ].join(" ");
  untrustedContext.push(scopeText);

  if (context?.agentRole) {
    untrustedContext.push(`Your role: ${context.agentRole}`);
  }

  const otherAgents = context?.roomAgents ?? [];
  if (otherAgents.length > 0) {
    const agentList = otherAgents.map((a) => {
      const display = a.nickname ? `${a.nickname} (@${a.name})` : `@${a.name}`;
      return a.role ? `${display} — ${a.role}` : display;
    });
    untrustedContext.push(
      `Other agents in this room:\n${agentList.map((l) => `- ${l}`).join("\n")}\n\n` +
      `HOW TO INTERACT WITH OTHER AGENTS (two explicit commands only):\n\n` +
      `1. /discuss @name <content> — continue a discussion or ask a question\n` +
      `2. /delegate @name <task> — formally hand off a task for another agent to execute\n\n` +
      `RESPOND IN KIND:\n` +
      (incomingMode === "discuss"
        ? `- This message was sent to you via /discuss. Reply using /discuss to continue the conversation.\n` +
          `- Only switch to /delegate when you are formally handing off work, not just responding.\n`
        : incomingMode === "delegate"
        ? `- This message was sent to you via /delegate (a formal task handoff). Execute the task.\n` +
          `- If you need to clarify something first, use /discuss. Use /delegate only when handing work to someone else.\n`
        : `- This message is from a human. Use /discuss or /delegate to involve other agents as needed.\n`) +
      `\nRULES:\n` +
      `- Commands must appear on their own line\n` +
      `- Only ONE command per message, targeting ONE agent\n` +
      `- @name anywhere else in your message is a reference only and does NOT trigger anyone\n` +
      `- When discussion reaches a conclusion, output your final result without any command`
    );
  }

  if (historyLines.length > 0) {
    untrustedContext.push(historyLines.join("\n"));
  }

  const ctx = {
    Body: effectiveBody,
    From: msg.from,
    SenderName: msg.from,
    WasMentioned: true,
    SessionKey: perMsgSessionKey,
    AccountId: accountId,
    Surface: "clawswarm",
    Provider: "clawswarm",
    ChatType: "group",
    MessageSid: msg.id,
    ConversationLabel: `ClawSwarm room ${msg.roomId}`,
    UntrustedContext: untrustedContext,
  };

  dispatch({
    ctx,
    cfg,
    dispatcherOptions: {
      deliver: async (payload: any) => {
        const text: string =
          typeof payload?.text === "string"
            ? payload.text
            : typeof payload?.body === "string"
            ? payload.body
            : String(payload ?? "");
        if (!text) return;
        if (!conn.roomId || conn.ws.readyState !== 1) return;
        conn.ws.send(
          JSON.stringify({ type: "message", roomId: conn.roomId, content: text })
        );
      },
    },
  }).catch((err: unknown) => {
    process.stderr.write(`[clawswarm] dispatch error: ${(err as any)?.message ?? err}\n`);
  });
}

// ─── Exported channel plugin object ──────────────────────────────────────────

export const channel = {
  id: "clawswarm",
  meta: {
    id: "clawswarm",
    label: "ClawSwarm",
    selectionLabel: "ClawSwarm (Group Chat)",
    blurb:
      "Connect this OpenClaw instance to a ClawSwarm multi-agent group chat. " +
      "The agent responds when @-mentioned in the chat room.",
    order: 200,
  },

  capabilities: {
    chatTypes: ["group" as const],
  },

  accountConfigSchema: {
    type: "object" as const,
    additionalProperties: false as const,
    required: ["serverUrl", "token", "agentName"],
    properties: {
      serverUrl: {
        type: "string" as const,
        title: "Server URL",
        description: "WebSocket URL of the ClawSwarm API (e.g. ws://localhost:3000)",
        examples: ["ws://localhost:3000", "wss://clawswarm.example.com"],
      },
      token: {
        type: "string" as const,
        title: "Auth Token",
        description: "Token from ClawSwarm admin panel (starts with ocs_)",
        pattern: "^ocs_",
      },
      agentName: {
        type: "string" as const,
        title: "Agent Name",
        description: "Display name of this OpenClaw agent in the group chat",
      },
    },
  },

  configAdapter: {
    listAccountIds: (cfg: any): string[] => {
      const accounts = cfg?.channels?.clawswarm?.accounts;
      if (!accounts || typeof accounts !== "object") return [];
      return Object.keys(accounts);
    },
    resolveAccount: (cfg: any, accountId?: string | null): any => {
      const section = cfg?.channels?.clawswarm;
      const id = accountId ?? Object.keys(section?.accounts ?? {})[0];
      const raw = section?.accounts?.[id] ?? {};
      return { accountId: id, config: raw.config ?? {} };
    },
    defaultAccountId: (cfg: any): string => {
      const section = cfg?.channels?.clawswarm;
      if (section?.defaultAccount) return section.defaultAccount;
      return Object.keys(section?.accounts ?? {})[0] ?? "default";
    },
    inspectAccount: (cfg: any, accountId?: string | null): any => {
      const section = cfg?.channels?.clawswarm;
      const id = accountId ?? Object.keys(section?.accounts ?? {})[0];
      return section?.accounts?.[id] ?? {};
    },
    setAccountEnabled: (_cfg: any, _accountId: string, _enabled: boolean): void => {},
    deleteAccount: (_cfg: any, _accountId: string): void => {},
    resolveAllowFrom: (_account: any) => [],
    formatAllowFrom: (allowFrom: any[]) => allowFrom.map(String),
    resolveDefaultTo: (_account: any) => undefined,
  },

  config: {
    listAccountIds: (cfg: any): string[] => {
      const accounts = cfg?.channels?.clawswarm?.accounts;
      if (!accounts || typeof accounts !== "object") return [];
      return Object.keys(accounts);
    },
    resolveAccount: (cfg: any, accountId?: string | null): any => {
      const section = cfg?.channels?.clawswarm;
      const id = accountId ?? Object.keys(section?.accounts ?? {})[0];
      const raw = section?.accounts?.[id] ?? {};
      return { accountId: id, config: raw.config ?? {} };
    },
    defaultAccountId: (cfg: any): string => {
      const section = cfg?.channels?.clawswarm;
      if (section?.defaultAccount) return section.defaultAccount;
      return Object.keys(section?.accounts ?? {})[0] ?? "default";
    },
    inspectAccount: (cfg: any, accountId?: string | null): any => {
      const section = cfg?.channels?.clawswarm;
      const id = accountId ?? Object.keys(section?.accounts ?? {})[0];
      return section?.accounts?.[id] ?? {};
    },
    setAccountEnabled: (_cfg: any, _accountId: string, _enabled: boolean): void => {},
    deleteAccount: (_cfg: any, _accountId: string): void => {},
    resolveAllowFrom: (_account: any) => [],
    formatAllowFrom: (allowFrom: any[]) => allowFrom.map(String),
  },

  gateway: {
    async startAccount(ctx: any): Promise<void> {
      const accountId = ctx.accountId as string;
      const config = (ctx.account?.config ?? ctx.config) as ClawSwarmAccountConfig;

      if (!config?.serverUrl || !config?.token || !config?.agentName) {
        ctx.setStatus({
          status: "error",
          message: "Missing config: serverUrl, token, and agentName are required",
        });
        return;
      }

      ctx.setStatus({ status: "connecting", message: "Connecting to ClawSwarm…" });

      let conn: ActiveConn;
      try {
        conn = startConnection(accountId, config, ctx.cfg, ctx.channelRuntime);
      } catch (e: any) {
        ctx.setStatus({ status: "error", message: `startConnection failed: ${e?.message}` });
        return;
      }
      activeConns.set(accountId, conn);

      ctx.setStatus({
        status: "connected",
        message: `Connected as ${config.agentName}`,
      });

      await new Promise<void>((resolve) => {
        const signal = ctx.abortSignal ?? ctx.signal;
        if (!signal) {
          return;
        }
        if (signal.aborted) {
          (conn as any)._stop?.();
          activeConns.delete(accountId);
          resolve();
          return;
        }
        signal.addEventListener("abort", () => {
          (conn as any)._stop?.();
          activeConns.delete(accountId);
          resolve();
        });
      });
    },

    async stopAccount(ctx: any): Promise<void> {
      const accountId = ctx.accountId as string;
      const conn = activeConns.get(accountId);
      if (conn) {
        (conn as any)._stop?.();
        activeConns.delete(accountId);
      }
      ctx.setStatus({ status: "disconnected", message: "Stopped" });
    },
  },

  // ─── Outbound send ─────────────────────────────────────────────────────────
  send: {
    async send(params: any): Promise<void> {
      const { accountId, body } = params as { accountId: string; body: string };
      const conn = activeConns.get(accountId);
      if (!conn) throw new Error(`[clawswarm] No active connection for ${accountId}`);
      if (!conn.roomId) throw new Error(`[clawswarm] roomId not yet known for ${accountId}`);
      if (conn.ws.readyState !== WebSocket.OPEN)
        throw new Error(`[clawswarm] WebSocket not open for ${accountId}`);

      const msg: CsOutboundMessage = { type: "message", roomId: conn.roomId, content: body };
      conn.ws.send(JSON.stringify(msg));
    },
  },

  // ─── Typing indicator ──────────────────────────────────────────────────────
  typing: {
    async sendTyping(params: any): Promise<void> {
      const { accountId, status } = params as {
        accountId: string;
        status: "start" | "stop";
      };
      const conn = activeConns.get(accountId);
      if (!conn?.roomId || conn.ws.readyState !== WebSocket.OPEN) return;

      const msg: CsOutboundTyping = {
        type: "typing",
        roomId: conn.roomId,
        status,
      };
      conn.ws.send(JSON.stringify(msg));
    },
  },
};
