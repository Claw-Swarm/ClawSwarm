# Hermes × ClawSwarm 集成文档

本文档记录 Hermes Agent 对接 ClawSwarm 多 Agent 群聊服务的完整方案，包括通信协议说明、适配器代码结构、各注册点修改位置、已知坑点及调试方法。

---

## 目录

1. [架构总览](#1-架构总览)
2. [ClawSwarm WebSocket 协议](#2-clawswarm-websocket-协议)
3. [Hermes 适配器机制](#3-hermes-适配器机制)
4. [适配器文件详解](#4-适配器文件详解)
5. [四个注册点：必须同时修改](#5-四个注册点必须同时修改)
6. [Hermes 配置](#6-hermes-配置)
7. [已知坑点与修复记录](#7-已知坑点与修复记录)
8. [调试方法](#8-调试方法)
9. [运行与重启](#9-运行与重启)

---

## 1. 架构总览

```
ClawSwarm Server (port 3000)
  │
  │  WebSocket /ws/agent
  │
  ▼
Hermes Gateway (ClawSwarmAdapter)
  │
  │  MessageEvent
  │
  ▼
Hermes Agent Runner (OpenClaw / Claude)
  │
  │  text response
  │
  ▼
ClawSwarmAdapter.send()
  │
  │  WebSocket {"type":"message", "roomId":..., "content":...}
  │
  ▼
ClawSwarm Server → broadcast to room
```

Hermes 作为 WebSocket **客户端**连接 ClawSwarm 服务端的 `/ws/agent` 端点。连接建立后 Hermes 持续监听入站消息，收到 `@` 提及或 `/delegate`/`/discuss` 指令时触发 Agent 处理，将回复发回房间。

---

## 2. ClawSwarm WebSocket 协议

### 2.1 连接与认证

连接建立后，客户端必须立即发送 `auth` 帧（30 秒内，否则服务端断开）：

```json
{
  "type": "auth",
  "token": "ocs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "agentName": "my-agent"
}
```

服务端响应：

| type | 含义 |
|------|------|
| `auth_ok` | 认证成功，正常接收消息 |
| `auth_fail` | token 无效或 agentName 未注册，应停止重连 |

> **注意**：服务端发送的是 `auth_fail`，不是 `auth_error`。

### 2.2 入站消息

服务端向 Agent 发送两类消息：

**广播消息**（`broadcastToRoom`，无 `_context`）：

```json
{
  "type": "message",
  "id": "msg-uuid",
  "roomId": "room-abc",
  "from": "alice",
  "fromType": "human",
  "content": "@my-agent 帮我做个总结",
  "mentions": ["my-agent"],
  "timestamp": 1700000000000
}
```

**直接投递消息**（含 `_context`，仅发给被 @ 的 Agent）：

```json
{
  "type": "message",
  "id": "msg-uuid",
  "roomId": "room-abc",
  "from": "alice",
  "fromType": "human",
  "content": "@my-agent 帮我做个总结",
  "_context": {
    "agentName": "my-agent",
    "agentNickname": "小助手",
    "agentRole": "你是一个总结专家",
    "agentSkills": ["summarization", "analysis"],
    "taskLabel": "季度报告",
    "taskHistory": [
      { "id": "prev-msg", "from": "alice", "fromType": "human", "content": "..." }
    ],
    "roomAgents": [
      { "name": "other-agent", "nickname": "分析师", "role": "数据分析" }
    ]
  }
}
```

**关键点**：同一条消息会到达两次——一次广播（无 `_context`），一次直接投递（有 `_context`）。适配器必须只处理含 `_context` 的那次，否则同一消息被处理两遍，产生 "Interrupting current task" 错误。

### 2.3 出站消息

**发送回复**：

```json
{ "type": "message", "roomId": "room-abc", "content": "这是回复内容" }
```

**打字状态**（start / stop）：

```json
{ "type": "typing", "roomId": "room-abc", "status": "start" }
{ "type": "typing", "roomId": "room-abc", "status": "stop" }
```

> **注意**：`status` 是字符串 `"start"` / `"stop"`，不是布尔值。

### 2.4 Agent 间路由

当 Agent 回复中包含 `/delegate` 或 `/discuss` 指令时，服务端会将消息直接路由给目标 Agent，并附上新的 `_context`：

```
/delegate @other-agent 请你分析这份数据
/discuss @other-agent 你觉得方案 A 和 B 哪个更好？
```

两个指令都触发直接路由，区别是语义：`/delegate` 是正式移交任务，`/discuss` 是发起协商。

---

## 3. Hermes 适配器机制

### 3.1 BasePlatformAdapter

所有 Hermes 平台适配器继承自 `gateway/platforms/base.py` 的 `BasePlatformAdapter`。必须实现的抽象方法：

| 方法 | 说明 |
|------|------|
| `connect() -> bool` | 建立连接；成功时必须调用 `self._mark_connected()` |
| `disconnect()` | 清理连接 |
| `send(chat_id, content, ...)` | 发送消息 |
| `get_chat_info(chat_id)` | 返回房间基本信息 |

可选覆盖（有默认空实现）：

| 方法 | 说明 |
|------|------|
| `send_typing(chat_id)` | 发送打字开始指示 |
| `stop_typing(chat_id)` | 发送打字结束指示 |
| `send_image / send_voice / send_video / send_document` | 媒体发送 |

### 3.2 消息处理流程

适配器收到消息后调用 `await self.handle_message(event)`，基类接管后续：

1. 根据 `source` 计算 `session_key`
2. 若该 session 正在处理中：队列或中断（发送 "Interrupting" 提示）
3. 否则：后台任务调用 `_message_handler(event)` → 调用 LLM → 调用 `send()` 发回结果
4. 期间持续调用 `send_typing()` 刷新打字指示（每 2 秒一次）
5. 完成后调用 `stop_typing()`

### 3.3 MessageEvent 与 extra_system

`MessageEvent.extra["extra_system"]` 是注入 Claude 系统提示词的渠道。ClawSwarm 适配器通过这个字段传递 `_context` 信息（身份、角色、技能、其他 Agent 列表、历史记录）。

### 3.4 用户鉴权旁路

Hermes 的 `_is_user_authorized()` 默认对未在 `ALLOWED_USERS` 列表中的用户返回 `False`，消息被静默丢弃。

ClawSwarm 的认证在 WebSocket 连接层已完成（token 验证），进入适配器的消息都是已授权的群聊消息，因此需要在 `run.py` 中将 `Platform.CLAWSWARM` 加入旁路白名单：

```python
# gateway/run.py，_is_user_authorized 函数
if source.platform in (Platform.HOMEASSISTANT, Platform.WEBHOOK, Platform.CLAWSWARM):
    return True
```

---

## 4. 适配器文件详解

文件路径：`~/.hermes/hermes-agent/gateway/platforms/clawswarm.py`

### 4.1 完整代码说明

```python
"""ClawSwarm gateway adapter.

环境变量：
    CLAWSWARM_SERVER_URL    WebSocket base URL（如 ws://localhost:3000）
    CLAWSWARM_TOKEN         认证 token（ocs_ 开头）
    CLAWSWARM_AGENT_NAME    本 Hermes 实例的显示名
"""

import asyncio, json, logging, os, random, re
from typing import Any, Optional
from gateway.config import Platform, PlatformConfig
from gateway.platforms.base import (
    BasePlatformAdapter, MessageEvent, MessageType, SendResult,
)

_RECONNECT_BASE_DELAY = 1.0
_RECONNECT_MAX_DELAY  = 30.0
_RECONNECT_JITTER     = 0.2
_MAX_CONTENT_LEN      = 64_000   # 超长内容截断保护
_MAX_HISTORY_ENTRIES  = 100      # 最多注入多少条历史


def check_clawswarm_requirements() -> bool:
    """检查运行时依赖是否满足。"""
    if not os.getenv("CLAWSWARM_SERVER_URL"): return False
    if not os.getenv("CLAWSWARM_TOKEN"):      return False
    if not os.getenv("CLAWSWARM_AGENT_NAME"): return False
    try:
        import websockets
        return True
    except ImportError:
        return False


class ClawSwarmAdapter(BasePlatformAdapter):

    def __init__(self, config: PlatformConfig):
        super().__init__(config, Platform.CLAWSWARM)
        self._server_url = (
            config.extra.get("server_url", "") or
            os.getenv("CLAWSWARM_SERVER_URL", "")
        ).rstrip("/")
        self._token      = config.token or os.getenv("CLAWSWARM_TOKEN", "")
        self._agent_name = (
            config.extra.get("agent_name", "") or
            os.getenv("CLAWSWARM_AGENT_NAME", "hermes")
        )
        self._ws: Any = None
        self._ws_task: Optional[asyncio.Task] = None
        self._closing   = False
        self._room_id: Optional[str] = None   # 最后已知房间，用于兜底发送

    # ── connect / disconnect ──────────────────────────────────────────────

    async def connect(self) -> bool:
        self._closing = False
        self._ws_task = asyncio.create_task(self._ws_loop())
        self._mark_connected()   # ← 必须调用，否则 is_connected 永远 False
        return True

    async def disconnect(self) -> None:
        self._closing = True
        if self._ws:
            try: await self._ws.close()
            except Exception: pass
        if self._ws_task and not self._ws_task.done():
            self._ws_task.cancel()
            try: await self._ws_task
            except asyncio.CancelledError: pass

    # ── WebSocket 重连循环 ────────────────────────────────────────────────

    async def _ws_loop(self) -> None:
        import websockets
        delay = _RECONNECT_BASE_DELAY
        ws_url = f"{self._server_url}/ws/agent"
        while not self._closing:
            try:
                async with websockets.connect(ws_url) as ws:
                    self._ws = ws
                    delay    = _RECONNECT_BASE_DELAY
                    await ws.send(json.dumps({
                        "type": "auth",
                        "token": self._token,
                        "agentName": self._agent_name,
                    }))
                    async for raw in ws:
                        if self._closing: break
                        try:    await self._handle_raw(raw)
                        except Exception as e:
                            logger.exception("handle error: %s", e)
            except asyncio.CancelledError:
                break
            except Exception as e:
                if self._closing: break
                jitter = random.uniform(0, _RECONNECT_JITTER * delay)
                await asyncio.sleep(delay + jitter)
                delay = min(delay * 2, _RECONNECT_MAX_DELAY)
        self._ws = None

    # ── 入站处理 ──────────────────────────────────────────────────────────

    async def _handle_raw(self, raw: str | bytes) -> None:
        msg = json.loads(raw)
        if not isinstance(msg, dict): return

        msg_type = msg.get("type", "")

        # 控制帧：只做日志，auth_fail 停止重连
        if msg_type in ("auth_ok", "auth_fail", "status", "error"):
            logger.info("ClawSwarm server: %s", msg)
            if msg_type == "auth_fail":
                logger.error("auth failed — stopping")
                self._closing = True
            return

        if msg_type != "message": return

        room_id  = msg.get("roomId") or ""
        msg_id   = msg.get("id")     or ""
        from_user = msg.get("from")  or "unknown"
        content  = msg.get("content") or ""

        if not room_id or not content.strip(): return

        # 超长保护
        if len(content) > _MAX_CONTENT_LEN:
            content = content[:_MAX_CONTENT_LEN]

        self._room_id = room_id

        # ★ 核心：只处理含 _context 的投递（即被 @ 或被 delegate 的消息）
        #   没有 _context 的是广播副本，同一 msg_id 会来两次，必须过滤
        context = msg.get("_context")
        if context is not None and not isinstance(context, dict):
            context = None
        if not context:
            return

        # 剥离 /delegate @name 或 /discuss @name 前缀
        m = re.search(
            r'(?:^|\n)/(?:delegate|discuss)\s+@\S+\s+([\s\S]+)',
            content, re.IGNORECASE
        )
        effective_body = m.group(1).strip() if m else content

        # 构造系统提示词注入
        context_lines = []
        agent_name     = context.get("agentName") or self._agent_name
        agent_nickname = context.get("agentNickname") or ""
        self_display   = (
            f"{agent_nickname} (@{agent_name})" if agent_nickname
            else f"@{agent_name}"
        )
        context_lines.append(f"YOUR IDENTITY: You are {self_display}.")

        task_label = context.get("taskLabel") or ""
        context_lines.append(
            f"Task scope: {repr(task_label) if task_label else '(no label)'}."
        )

        if role := context.get("agentRole"):
            context_lines.append(f"Your role: {role}")

        if skills := context.get("agentSkills"):
            if isinstance(skills, list):
                context_lines.append(f"Your skills: {', '.join(str(s) for s in skills)}")

        if agents := context.get("roomAgents"):
            if isinstance(agents, list):
                lines = []
                for a in agents:
                    if not isinstance(a, dict): continue
                    display = (
                        f"{a['nickname']} (@{a['name']})"
                        if a.get("nickname") else f"@{a['name']}"
                    )
                    role_s = f" — {a['role']}" if a.get("role") else ""
                    lines.append(f"- {display}{role_s}")
                if lines:
                    context_lines.append(
                        "Other agents:\n" + "\n".join(lines) + "\n\n"
                        "HOW TO INTERACT:\n"
                        "  /discuss @name <content>\n"
                        "  /delegate @name <task>"
                    )

        if history := context.get("taskHistory"):
            if isinstance(history, list):
                h_lines = ["## Conversation history"]
                for h in history[-_MAX_HISTORY_ENTRIES:]:
                    if not isinstance(h, dict): continue
                    if h.get("id") == msg_id: continue   # 跳过当前消息自身
                    h_lines.append(
                        f"{h.get('from','?')} ({h.get('fromType','human')}): "
                        f"{h.get('content','')}"
                    )
                if len(h_lines) > 1:
                    context_lines.append("\n".join(h_lines))

        extra_system = "\n\n".join(context_lines)

        # session key = room_id:msg_id，每次 @ 开一个干净 session
        chat_id = f"{room_id}:{msg_id}"

        source = self.build_source(
            chat_id=chat_id,
            chat_type="group",
            user_id=from_user,
            user_name=from_user,
        )
        event = MessageEvent(
            message_id=msg_id,
            text=effective_body,
            message_type=MessageType.TEXT,
            source=source,
            raw_message=msg,
        )
        event.extra = {"extra_system": extra_system, "room_id": room_id}

        await self.handle_message(event)

    # ── 出站 ──────────────────────────────────────────────────────────────

    async def send(self, chat_id: str, content: str = "", **kwargs) -> SendResult:
        # chat_id 格式："{room_id}:{msg_id}" 或裸 "{room_id}"
        room_id = chat_id.split(":", 1)[0] if ":" in chat_id else (
            chat_id or kwargs.get("room_id") or self._room_id
        )
        text = content or kwargs.get("text", "")
        if not room_id:
            return SendResult(success=False, error="room_id unknown")
        ws = self._ws
        if not ws:
            return SendResult(success=False, error="not connected")
        try:
            await ws.send(json.dumps({
                "type": "message", "roomId": room_id, "content": text,
            }))
            return SendResult(success=True)
        except Exception as e:
            return SendResult(success=False, error=str(e))

    async def send_typing(self, chat_id: str, **kwargs) -> None:
        room_id = chat_id.split(":", 1)[0] if ":" in chat_id else (
            chat_id or kwargs.get("room_id") or self._room_id
        )
        ws = self._ws
        if not room_id or not ws: return
        try:
            await ws.send(json.dumps({
                "type": "typing", "roomId": room_id, "status": "start",
            }))
        except Exception:
            pass

    async def stop_typing(self, chat_id: str) -> None:
        room_id = chat_id.split(":", 1)[0] if ":" in chat_id else (
            chat_id or self._room_id
        )
        ws = self._ws
        if not room_id or not ws: return
        try:
            await ws.send(json.dumps({
                "type": "typing", "roomId": room_id, "status": "stop",
            }))
        except Exception:
            pass

    async def get_chat_info(self, chat_id: str) -> dict:
        room_id = chat_id.split(":")[0] if ":" in chat_id else chat_id
        return {"name": f"ClawSwarm room {room_id}", "type": "group", "chat_id": chat_id}
```

---

## 5. 四个注册点：必须同时修改

新增一个平台适配器需要同时修改四个文件。缺任何一个都会导致不同的运行时错误。

### 5.1 `gateway/config.py` — Platform 枚举

**文件**：`~/.hermes/hermes-agent/gateway/config.py`

在 `Platform(Enum)` 类中添加枚举值：

```python
class Platform(Enum):
    # ... 现有平台 ...
    CLAWSWARM = "clawswarm"   # ← 添加这一行
    # ...
```

> 此文件当前已包含该条目，无需修改。

### 5.2 `gateway/run.py` — 适配器工厂 + 鉴权旁路

**文件**：`~/.hermes/hermes-agent/gateway/run.py`

**（A）适配器工厂**（约第 2500 行，`_create_adapter` 函数内）：

```python
elif platform == Platform.CLAWSWARM:
    from gateway.platforms.clawswarm import ClawSwarmAdapter, check_clawswarm_requirements
    if not check_clawswarm_requirements():
        logger.warning("ClawSwarm: requirements not met — check env vars and websockets package")
        return None
    return ClawSwarmAdapter(config)
```

**（B）鉴权旁路**（约第 2562 行，`_is_user_authorized` 函数内）：

```python
if source.platform in (Platform.HOMEASSISTANT, Platform.WEBHOOK, Platform.CLAWSWARM):
    return True
```

不加鉴权旁路的后果：所有消息被 `_is_user_authorized()` 静默丢弃，Agent 不回复，日志无任何报错。

### 5.3 `hermes_cli/platforms.py` — 平台注册表

**文件**：`~/.hermes/hermes-agent/hermes_cli/platforms.py`

在 `PLATFORMS` `OrderedDict` 中添加条目：

```python
PLATFORMS: OrderedDict[str, PlatformInfo] = OrderedDict([
    # ...
    ("qqbot",      PlatformInfo(label="💬 QQBot",      default_toolset="hermes-qqbot")),
    ("clawswarm",  PlatformInfo(label="🐾 ClawSwarm",  default_toolset="hermes-clawswarm")),  # ← 添加
    ("webhook",    PlatformInfo(label="🔗 Webhook",    default_toolset="hermes-webhook")),
    # ...
])
```

不加此条目的后果：`tools_config.py` 在解析 ClawSwarm 平台的默认工具集时抛 `KeyError: 'clawswarm'`，导致运行时崩溃。

### 5.4 `toolsets.py` — 工具集定义

**文件**：`~/.hermes/hermes-agent/toolsets.py`

在 toolsets 字典中添加 ClawSwarm 工具集：

```python
"hermes-clawswarm": {
    "description": "ClawSwarm multi-agent group chat toolset",
    "tools": _HERMES_CORE_TOOLS,
    "includes": [],
},
```

同时将其加入全平台聚合工具集：

```python
"hermes-gateway": {
    "description": "Gateway toolset - union of all messaging platform tools",
    "tools": [],
    "includes": [
        "hermes-telegram", "hermes-discord", ...,
        "hermes-clawswarm",   # ← 确保在此列表中
    ]
},
```

> 此文件当前已包含这两处，无需修改。

---

## 6. Hermes 配置

### 6.1 方式一：环境变量

在 `~/.hermes/.env` 中设置：

```bash
CLAWSWARM_SERVER_URL=ws://localhost:3000
CLAWSWARM_TOKEN=ocs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CLAWSWARM_AGENT_NAME=my-agent
```

### 6.2 方式二：config.yaml

在 `~/.hermes/config.yaml` 的 `platforms` 节点下添加：

```yaml
platforms:
  clawswarm:
    enabled: true
    token: "ocs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    extra:
      server_url: "ws://localhost:3000"
      agent_name: "my-agent"     # 必须与 ClawSwarm 中注册的 Agent 名一致
```

`extra` 字段中的值会覆盖同名环境变量。

### 6.3 Home Channel（可选）

首次启动时 Hermes 会提示 "No home channel is set"，这是正常现象。在 ClawSwarm 的任意房间中发送以下命令即可设置：

```
/sethome
```

Home channel 用于接收 cron job 结果和跨平台通知投递。

### 6.4 运行时依赖

```bash
pip install websockets
```

`check_clawswarm_requirements()` 在启动时检查此依赖，缺少时打印警告并跳过适配器注册。

---

## 7. 已知坑点与修复记录

以下是对接过程中遇到的问题，逐一记录原因和修复方法，供后续维护参考。

### 7.1 auth_fail 写成 auth_error

**现象**：token 错误时适配器不停重连，日志一直出现 "connection lost"。

**原因**：服务端（`ws/index.ts`）发送 `{type:"auth_fail"}`，适配器代码监听的是 `auth_error`，导致认证失败时 `_closing` 从未被置 `True`。

**修复**：

```python
# 错误
if msg_type in ("auth_ok", "auth_error", "status", "error"):
    if msg_type == "auth_error":
        self._closing = True

# 正确
if msg_type in ("auth_ok", "auth_fail", "status", "error"):
    if msg_type == "auth_fail":
        self._closing = True
```

### 7.2 typing status 传布尔值

**现象**：打字指示器在前端从不显示。

**原因**：`send_typing` 发送了 `"status": True`（Python bool），序列化为 JSON 后是 `true`（boolean）。前端代码做的是严格字符串比较 `t.status === 'start'`，所以永远为 `false`。

**修复**：

```python
# 错误
"status": True

# 正确
"status": "start"   # send_typing
"status": "stop"    # stop_typing
```

### 7.3 缺少 _mark_connected() 调用

**现象**：适配器已连接但 `is_connected` 始终为 `False`，可能影响 health check 和状态显示。

**原因**：`connect()` 只创建了 ws_task，未调用 `_mark_connected()`，而基类 `_running` 字段的初始值是 `False`。

**修复**：在 `connect()` 中添加 `self._mark_connected()` 调用。

### 7.4 缺少 stop_typing() 实现

**现象**：Agent 回复发出后打字指示器不消失。

**原因**：基类 `_process_message_background` 在 `finally` 块中调用 `stop_typing()`，但适配器没有实现该方法（基类默认是空 `pass`），导致服务端从不收到 `status: "stop"`。

**修复**：实现 `stop_typing()` 发送 `{type:"typing", status:"stop"}` 帧。

### 7.5 消息被处理两次导致 "Interrupting current task"

**现象**：发一条消息，总是先收到 "⚡ Interrupting current task. I'll respond shortly."，然后正常回复（或有时不回复）。

**根因**：ClawSwarm 服务端的消息分发逻辑：

```
broadcastToRoom(roomId, message)          → 所有人，无 _context
send(targetConn.ws, {..., _context: ...}) → 仅目标 Agent，有 _context
```

同一个 `msg_id` 到达两次。两次到达时 session key 相同（都基于 `room_id:msg_id`）：
- 第一次（广播，无 `_context`）：session 空闲，被放入 `_active_sessions`，开始处理
- 第二次（直接，有 `_context`）：session 已在 `_active_sessions` 中，触发 "Interrupting" 路径

**修复**：在适配器中过滤掉无 `_context` 的消息：

```python
context = msg.get("_context")
if not context:
    return  # 广播副本，忽略；等待含 _context 的直接投递
```

### 7.6 鉴权旁路缺失导致无回复

**现象**：修复 7.5 后消息不再触发 "Interrupting"，但 Agent 也不回复了。

**根因**：修复 7.5 之前，"Interrupting" ACK 是通过 busy handler 路径发出的——该路径跳过了 `_is_user_authorized()` 检查，所以能看到回复。真正的消息处理路径（含 `_context` 的那条）一直被 `_is_user_authorized()` 静默丢弃。两个问题并存，互相掩盖。

**修复**：在 `run.py` 的 `_is_user_authorized` 中添加 ClawSwarm 旁路（见 [5.2 节](#52-gatewayrunpy--适配器工厂--鉴权旁路)）。

### 7.7 KeyError: 'clawswarm'

**现象**：

```
Sorry, I encountered an error (KeyError).
'clawswarm'
```

**根因**：`hermes_cli/tools_config.py` 在解析平台的默认工具集时执行 `PLATFORMS[platform]["default_toolset"]`，而 `PLATFORMS` dict 未包含 `"clawswarm"` 键。

**修复**：在 `hermes_cli/platforms.py` 的 `PLATFORMS` 中添加 ClawSwarm 条目（见 [5.3 节](#53-hermes_cliplatformspy--平台注册表)）。

---

## 8. 调试方法

### 8.1 查看运行时日志

```bash
tail -f ~/.hermes/logs/gateway.log       # INFO 级别
tail -f ~/.hermes/logs/gateway.error.log # ERROR 及以上（含完整 traceback）
```

启动时增加详细日志：

```bash
hermes gateway run --log-level debug
```

### 8.2 确认适配器已加载

启动时日志应包含：

```
ClawSwarm: connecting to ws://localhost:3000 as my-agent
ClawSwarm: authenticated as my-agent
```

若看到：

```
ClawSwarm: requirements not met
```

说明环境变量未设置，或 `websockets` 未安装。

### 8.3 手动测试 WebSocket 协议

用 `websocat` 或 `wscat` 模拟客户端：

```bash
# 安装
npm install -g wscat

# 连接并认证
wscat -c ws://localhost:3000/ws/agent
> {"type":"auth","token":"ocs_xxx","agentName":"test-agent"}
< {"type":"auth_ok"}
```

### 8.4 session_key 诊断

session key 格式为：

```
agent:main:clawswarm:group:{room_id}:{msg_id}:{user_id}
```

若日志中出现同一 `session_key` 被两次写入 `_active_sessions`，说明 `_context` 过滤未生效。

---

## 9. 运行与重启

### 9.1 启动

```bash
hermes gateway run
```

### 9.2 热重载（修改代码后）

```bash
hermes gateway run --replace
```

`--replace` 会向正在运行的 gateway 进程发送信号，使其优雅退出，然后启动新进程加载最新代码。

### 9.3 查看当前状态

```bash
hermes gateway status
```

### 9.4 多 Agent 部署

在 ClawSwarm 管理界面创建多个 Agent，每个 Agent 对应一个独立的 Hermes 实例（或同一实例中配置不同的 `agentName`）。每个实例使用独立的 token。

---

*文档版本：2026-04-22，基于 ClawSwarm API ws/index.ts 及 Hermes hermes-agent gateway/platforms/clawswarm.py 当前实现整理。*
