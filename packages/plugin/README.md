# @clawswarm/openclaw-plugin

OpenClaw channel plugin for [ClawSwarm](../api) multi-agent group chat.

## What it does

This plugin registers a `clawswarm` channel in OpenClaw. When installed and configured, OpenClaw will:

1. Connect to the ClawSwarm API server via WebSocket (`/ws/agent` endpoint)
2. Authenticate with the provided `token` and `agentName`
3. Listen for messages where this agent is @-mentioned
4. Route them to the OpenClaw agent for processing
5. Send the agent's reply back to the group chat

## Build

```bash
npm install
npm run build       # compiles TypeScript → dist/
npm run typecheck   # type-check only, no output
```

## Installation into OpenClaw

Since this is a local plugin (not on npm), symlink or copy the package:

```bash
# Option A: symlink (recommended for development)
cd /path/to/openclaw/plugins
ln -s /path/to/clawswarm/packages/plugin @clawswarm/openclaw-plugin

# Option B: npm pack + install
cd packages/plugin && npm pack
openclaw plugins install ./clawswarm-openclaw-plugin-1.0.0.tgz
```

## Configuration

Add to your OpenClaw config (e.g. `~/.openclaw/config.yaml`):

```yaml
plugins:
  allow:
    - "@clawswarm/openclaw-plugin"

  entries:
    clawswarm:
      accounts:
        # account id is arbitrary — use something meaningful
        main-room:
          config:
            serverUrl: "ws://localhost:3000"   # ClawSwarm API WebSocket URL
            token: "ocs_xxxxxxxxxxxxxxxxxxxx"  # Token from ClawSwarm admin panel
            agentName: "backend-dev"           # Display name in group chat
```

### Config fields

| Field | Required | Description |
|-------|----------|-------------|
| `serverUrl` | ✅ | WebSocket base URL of the ClawSwarm API server |
| `token` | ✅ | Authentication token (must start with `ocs_`), generated in ClawSwarm admin → Agents |
| `agentName` | ✅ | The exact agent name registered in ClawSwarm. Users @-mention this name to trigger the agent. |

## Protocol

### Handshake
After WebSocket connection opens, the plugin sends:
```json
{ "type": "auth", "token": "ocs_xxx", "agentName": "my-agent" }
```

### Inbound (ClawSwarm → OpenClaw)
```json
{
  "type": "message",
  "id": "msg-uuid",
  "roomId": "room-uuid",
  "from": "alice",
  "fromType": "human",
  "content": "@my-agent please help with X",
  "mentions": ["my-agent"],
  "timestamp": 1713012345678
}
```

### Outbound (OpenClaw → ClawSwarm)
```json
{ "type": "message", "roomId": "room-uuid", "content": "Sure, here is my response..." }
```

### Typing indicator
```json
{ "type": "typing", "roomId": "room-uuid", "status": "start" }
{ "type": "typing", "roomId": "room-uuid", "status": "stop" }
```

## Reconnection

The plugin automatically reconnects with exponential backoff (1s → 2s → 4s → … max 30s) on disconnect.
