import * as http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { getDb } from '../db';
import type {
  AgentRow,
  MessageRow,
  RequirementMarkRow,
  AgentContext,
  WsAuthMsg,
  WsMessageMsg,
  WsTypingMsg,
} from '../types';
import { randomUUID } from 'crypto';

// ─── Connection state ───────────────────────────────────────────────────────

interface AgentConn {
  ws: WebSocket;
  agentId: string;
  agentName: string;
  rooms: Set<string>; // room IDs this agent belongs to
}

interface ClientConn {
  ws: WebSocket;
  // Web clients subscribe to all rooms for now (or could filter)
}

const agentConnections = new Map<string, AgentConn>(); // agentName → conn
const clientConnections = new Set<ClientConn>();

// ─── Heartbeat tracking ─────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL = parseInt(process.env.WS_HEARTBEAT_INTERVAL ?? '25000', 10);
const HEARTBEAT_TIMEOUT  = parseInt(process.env.WS_HEARTBEAT_TIMEOUT  ?? '30000', 10);

interface AliveWs extends WebSocket {
  _isAlive?: boolean;
  _heartbeatTimer?: ReturnType<typeof setTimeout>;
}

function startHeartbeat(ws: AliveWs): void {
  (ws as AliveWs)._isAlive = true;

  const pingLoop = setInterval(() => {
    if (!(ws as AliveWs)._isAlive) {
      clearInterval(pingLoop);
      ws.terminate();
      return;
    }
    (ws as AliveWs)._isAlive = false;
    ws.ping();

    // Kill if no pong arrives within HEARTBEAT_TIMEOUT
    (ws as AliveWs)._heartbeatTimer = setTimeout(() => {
      if (!(ws as AliveWs)._isAlive) {
        ws.terminate();
      }
    }, HEARTBEAT_TIMEOUT);
  }, HEARTBEAT_INTERVAL);

  ws.on('pong', () => {
    (ws as AliveWs)._isAlive = true;
    if ((ws as AliveWs)._heartbeatTimer) {
      clearTimeout((ws as AliveWs)._heartbeatTimer);
    }
  });

  ws.on('close', () => {
    clearInterval(pingLoop);
    if ((ws as AliveWs)._heartbeatTimer) {
      clearTimeout((ws as AliveWs)._heartbeatTimer);
    }
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function send(ws: WebSocket, data: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastToClients(data: object): void {
  const payload = JSON.stringify(data);
  for (const conn of clientConnections) {
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(payload);
    }
  }
}

function broadcastToRoom(roomId: string, data: object, excludeWs?: WebSocket): void {
  const payload = JSON.stringify(data);

  // Send to all web clients
  for (const conn of clientConnections) {
    if (conn.ws !== excludeWs && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(payload);
    }
  }

  // Send to all agents in the room
  for (const [, conn] of agentConnections) {
    if (conn.rooms.has(roomId) && conn.ws !== excludeWs && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(payload);
    }
  }
}

/** Parse @mentions from message content */
function parseMentions(content: string): string[] {
  const matches = content.matchAll(/@([^\s@,，。！？\\/]+)/gu);
  const names: string[] = [];
  for (const m of matches) {
    names.push(m[1]);
  }
  return [...new Set(names)];
}

/** Build agent context for a given agent + room */
function buildContext(agentId: string, roomId: string): AgentContext {
  const db = getDb();

  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as AgentRow | undefined;
  if (!agent) {
    return { agentName: '', agentNickname: '', agentRole: '', agentSkills: [], taskLabel: '', roomAgents: [], taskHistory: [] };
  }

  // Get most recent requirement mark for this room
  const mark = db
    .prepare('SELECT * FROM requirement_marks WHERE room_id = ? ORDER BY marked_at DESC LIMIT 1')
    .get(roomId) as RequirementMarkRow | undefined;

  let taskHistory: MessageRow[] = [];
  if (mark) {
    taskHistory = db
      .prepare(
        'SELECT * FROM messages WHERE room_id = ? AND timestamp >= ? ORDER BY timestamp ASC'
      )
      .all(roomId, mark.marked_at) as MessageRow[];
  } else {
    // No mark yet: return last 20 messages as context
    taskHistory = db
      .prepare(
        'SELECT * FROM messages WHERE room_id = ? ORDER BY timestamp DESC LIMIT 20'
      )
      .all(roomId) as MessageRow[];
    taskHistory.reverse();
  }

  const roomMemberRows = db
    .prepare(`
      SELECT a.name, a.nickname, a.role
      FROM room_members rm
      JOIN agents a ON a.id = rm.agent_id
      WHERE rm.room_id = ? AND a.id != ?
    `)
    .all(roomId, agentId) as Array<{ name: string; nickname: string; role: string }>;

  return {
    agentName: agent.name,
    agentNickname: agent.nickname ?? '',
    agentRole: agent.role,
    agentSkills: JSON.parse(agent.skills) as string[],
    taskLabel: mark?.label ?? '',
    roomAgents: roomMemberRows.map((a) => ({
      name: a.name,
      nickname: a.nickname ?? '',
      role: a.role ?? '',
    })),
    taskHistory: taskHistory.map((m) => ({
      id: m.id,
      from: m.from_id,
      fromType: m.from_type,
      content: m.content,
      timestamp: m.timestamp,
    })),
  };
}

/** Get all room IDs an agent belongs to */
function getAgentRooms(agentId: string): Set<string> {
  const db = getDb();
  const rows = db
    .prepare('SELECT room_id FROM room_members WHERE agent_id = ?')
    .all(agentId) as Array<{ room_id: string }>;
  return new Set(rows.map((r) => r.room_id));
}

// ─── Agent WS handler (/ws/agent) ───────────────────────────────────────────

export function handleAgentConnection(ws: WebSocket): void {
  startHeartbeat(ws as AliveWs);

  let authenticated = false;
  let agentId = '';
  let agentName = '';

  // 30s auth timeout
  const authTimeout = setTimeout(() => {
    if (!authenticated) {
      send(ws, { type: 'error', code: 'UNAUTHORIZED', message: 'Authentication timeout' });
      ws.terminate();
    }
  }, 30000);

  ws.on('message', (raw) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw.toString()) as Record<string, unknown>;
    } catch {
      send(ws, { type: 'error', code: 'INVALID_MESSAGE', message: 'Invalid JSON' });
      return;
    }

    const type = msg.type as string;

    // ── Ping/pong ──
    if (type === 'ping') {
      send(ws, { type: 'pong' });
      return;
    }
    if (type === 'pong') {
      (ws as AliveWs)._isAlive = true;
      return;
    }

    // ── Auth ──
    if (type === 'auth') {
      const { token, agentName: reqName } = msg as unknown as WsAuthMsg;
      if (!token || !reqName) {
        send(ws, { type: 'auth_fail', message: 'Missing token or agentName' });
        ws.terminate();
        return;
      }

      const db = getDb();
      const tokenRow = db
        .prepare('SELECT * FROM tokens WHERE token = ? AND revoked = 0')
        .get(token) as { id: string; agent_id: string } | undefined;

      if (!tokenRow) {
        send(ws, { type: 'auth_fail', message: 'Invalid or revoked token' });
        ws.terminate();
        return;
      }

      const agentRow = db
        .prepare('SELECT * FROM agents WHERE id = ?')
        .get(tokenRow.agent_id) as AgentRow | undefined;

      if (!agentRow || agentRow.name !== reqName) {
        send(ws, { type: 'auth_fail', message: 'Token/agent name mismatch' });
        ws.terminate();
        return;
      }

      // Auth success
      clearTimeout(authTimeout);
      authenticated = true;
      agentId = agentRow.id;
      agentName = agentRow.name;

      // Update agent status to online
      db.prepare("UPDATE agents SET status = 'online' WHERE id = ?").run(agentId);

      const rooms = getAgentRooms(agentId);
      agentConnections.set(agentName, { ws, agentId, agentName, rooms });

      send(ws, { type: 'auth_ok', agentId, agentName });

      // Broadcast status to web clients
      broadcastToClients({
        type: 'agent_status',
        agentId,
        agentName,
        status: 'online',
      });

      return;
    }

    // ── Require auth for all other messages ──
    if (!authenticated) {
      send(ws, { type: 'error', code: 'UNAUTHORIZED', message: 'Not authenticated' });
      return;
    }

    // ── Message from agent ──
    if (type === 'message') {
      const { roomId, content } = msg as unknown as WsMessageMsg;
      if (!roomId || !content) {
        send(ws, { type: 'error', code: 'INVALID_MESSAGE', message: 'Missing roomId or content' });
        return;
      }

      const db = getDb();

      // Verify agent is in the room
      const membership = db
        .prepare('SELECT 1 FROM room_members WHERE room_id = ? AND agent_id = ?')
        .get(roomId, agentId);
      if (!membership) {
        send(ws, { type: 'error', code: 'AGENT_NOT_IN_ROOM', message: 'Agent is not a member of this room' });
        return;
      }

      const mentions = parseMentions(content);
      const msgId = `msg_${randomUUID()}`;
      const timestamp = Date.now();

      // Handle /new-task
      if (content.trimStart().startsWith('/new-task')) {
        const label = content.replace(/^\/new-task\s*/i, '').trim();
        const markId = randomUUID();
        db.prepare(
          'INSERT INTO requirement_marks (id, room_id, label, marked_at) VALUES (?, ?, ?, ?)'
        ).run(markId, roomId, label, timestamp);
      }

      // Persist
      db.prepare(
        'INSERT INTO messages (id, room_id, from_id, from_type, content, mentions, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(msgId, roomId, agentName, 'agent', content, JSON.stringify(mentions), timestamp);

      const broadcastMsg = {
        type: 'message',
        id: msgId,
        roomId,
        from: agentName,
        fromType: 'agent' as const,
        content,
        mentions,
        timestamp,
      };

      broadcastToRoom(roomId, broadcastMsg);

      const delegateMatch = content.match(/(?:^|\n)\/delegate\s+@([^\s@,，。！？\\/]+)\s+([\s\S]+)/imu);
      const discussMatch  = content.match(/(?:^|\n)\/discuss\s+@([^\s@,，。！？\\/]+)\s+([\s\S]+)/imu);
      const triggerMatch  = delegateMatch ?? discussMatch;

      if (triggerMatch) {
        const targetName = triggerMatch[1];
        if (targetName !== agentName) {
          const targetConn = agentConnections.get(targetName);
          if (targetConn && targetConn.rooms.has(roomId)) {
            const ctx = buildContext(targetConn.agentId, roomId);
            send(targetConn.ws, { ...broadcastMsg, _context: ctx });
          }
        }
      }

      return;
    }

    // ── Typing from agent ──
    if (type === 'typing') {
      const { roomId, status: typingStatus } = msg as unknown as WsTypingMsg;
      if (!roomId || !typingStatus) return;

      broadcastToClients({
        type: 'typing',
        roomId,
        from: agentName,
        status: typingStatus,
      });

      return;
    }

    send(ws, { type: 'error', code: 'INVALID_MESSAGE', message: `Unknown message type: ${type}` });
  });

  ws.on('close', () => {
    clearTimeout(authTimeout);
    if (!authenticated) return;

    agentConnections.delete(agentName);
    const db = getDb();
    db.prepare("UPDATE agents SET status = 'offline' WHERE id = ?").run(agentId);

    broadcastToClients({
      type: 'agent_status',
      agentId,
      agentName,
      status: 'offline',
    });
  });

  ws.on('error', (err) => {
    console.error(`[WS/agent] Error for ${agentName || 'unauthenticated'}:`, err.message);
  });
}

// ─── Client WS handler (/ws/client) ─────────────────────────────────────────

export function handleClientConnection(ws: WebSocket): void {
  startHeartbeat(ws as AliveWs);
  const conn: ClientConn = { ws };
  clientConnections.add(conn);

  ws.on('message', (raw) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw.toString()) as Record<string, unknown>;
    } catch {
      send(ws, { type: 'error', code: 'INVALID_MESSAGE', message: 'Invalid JSON' });
      return;
    }

    const type = msg.type as string;

    if (type === 'ping') {
      send(ws, { type: 'pong' });
      return;
    }

    if (type === 'pong') {
      (ws as AliveWs)._isAlive = true;
      return;
    }

    // ── Message from human client ──
    if (type === 'message') {
      const { roomId, content } = msg as unknown as WsMessageMsg;
      if (!roomId || !content) {
        send(ws, { type: 'error', code: 'INVALID_MESSAGE', message: 'Missing roomId or content' });
        return;
      }

      const db = getDb();

      // Verify room exists
      const room = db.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId);
      if (!room) {
        send(ws, { type: 'error', code: 'ROOM_NOT_FOUND', message: 'Room not found' });
        return;
      }

      const mentions = parseMentions(content);
      const msgId = `msg_${randomUUID()}`;
      const timestamp = Date.now();

      // Handle /new-task
      if (content.trimStart().startsWith('/new-task')) {
        const label = content.replace(/^\/new-task\s*/i, '').trim();
        const markId = randomUUID();
        db.prepare(
          'INSERT INTO requirement_marks (id, room_id, label, marked_at) VALUES (?, ?, ?, ?)'
        ).run(markId, roomId, label, timestamp);
      }

      // Persist
      db.prepare(
        'INSERT INTO messages (id, room_id, from_id, from_type, content, mentions, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(msgId, roomId, 'human', 'human', content, JSON.stringify(mentions), timestamp);

      const broadcastMsg = {
        type: 'message',
        id: msgId,
        roomId,
        from: 'human',
        fromType: 'human' as const,
        content,
        mentions,
        timestamp,
      };

      // Broadcast to all web clients in the room (including sender)
      broadcastToRoom(roomId, broadcastMsg);

      // Push with _context to each mentioned agent
      for (const mentionedName of mentions) {
        const targetConn = agentConnections.get(mentionedName);
        if (targetConn && targetConn.rooms.has(roomId)) {
          const ctx = buildContext(targetConn.agentId, roomId);
          send(targetConn.ws, { ...broadcastMsg, _context: ctx });
        }
      }

      return;
    }

    send(ws, { type: 'error', code: 'INVALID_MESSAGE', message: `Unknown message type: ${type}` });
  });

  ws.on('close', () => {
    clientConnections.delete(conn);
  });

  ws.on('error', (err) => {
    console.error('[WS/client] Error:', err.message);
  });
}

// ─── Attach WS servers to HTTP server ───────────────────────────────────────

export function attachWebSocketServers(server: http.Server, accessToken = ''): void {
  const agentWss  = new WebSocketServer({ noServer: true });
  const clientWss = new WebSocketServer({ noServer: true });

  agentWss.on('connection',  handleAgentConnection);
  clientWss.on('connection', handleClientConnection);

  server.on('upgrade', (req, socket, head) => {
    const url = req.url ?? '';

    if (url.startsWith('/ws/agent')) {
      agentWss.handleUpgrade(req, socket, head, (ws) => {
        agentWss.emit('connection', ws, req);
      });
    } else if (url.startsWith('/ws/client')) {
      // Validate access token from query string
      if (accessToken) {
        const qs = new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?') + 1) : '');
        if (qs.get('token') !== accessToken) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
      }
      clientWss.handleUpgrade(req, socket, head, (ws) => {
        clientWss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });
}
