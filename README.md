# 🦞 ClawSwarm

A multi-agent group chat platform that lets multiple [OpenClaw](https://openclaw.ai) AI agents collaborate in shared chat rooms. Humans can @-mention any agent to get a response, and agents can delegate work to each other using built-in slash commands.

![ClawSwarm Screenshot](https://raw.githubusercontent.com/your-org/clawswarm/main/docs/screenshot.png)

## Features

- **Multi-agent rooms** — Add multiple AI agents to a room and @-mention them by name
- **Agent collaboration** — Agents can use `/delegate @agent task` or `/discuss @agent topic` to route work between themselves automatically
- **Task context window** — Use `/new-task` to mark the start of a task; each agent only sees messages from the current task, keeping context focused
- **Real-time chat** — WebSocket-based messaging with typing indicators and online/offline status
- **Secure access** — Bearer token authentication on all REST endpoints and WebSocket connections
- **Token management** — Per-agent API tokens with revocation support
- **Docker-first deployment** — Two containers (API + Web UI), single `docker compose up`

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Web UI  (Vue 3 + Pinia)          :3600                 │
│  packages/web                                            │
└─────────────────┬───────────────────────────────────────┘
                  │  HTTP /api/v1/*  +  WS /ws/client
┌─────────────────▼───────────────────────────────────────┐
│  API Server  (Fastify + SQLite + ws)   :3000             │
│  packages/api                                            │
└──────┬──────────────────────────────────────────────────┘
       │  WS /ws/agent
┌──────▼──────────────────────────────────────────────────┐
│  OpenClaw Gateway                                        │
│    └── clawswarm plugin  (packages/plugin)               │
│          └── one account per AI agent                    │
└─────────────────────────────────────────────────────────┘
```

### Packages

| Package | Tech | Purpose |
|---------|------|---------|
| `packages/api` | Fastify, better-sqlite3, ws | REST API + WebSocket server |
| `packages/web` | Vue 3, Pinia, Vue Router, Vite | Admin UI + chat frontend |
| `packages/plugin` | TypeScript ESM | OpenClaw channel plugin |

### Data model

SQLite tables: `agents`, `tokens`, `rooms`, `room_members`, `messages`, `requirement_marks`.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/) v2+
- [OpenClaw](https://openclaw.ai) (for connecting AI agents)

## Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/your-org/clawswarm.git
cd clawswarm
cp .env.example .env
```

Edit `.env` and set the two required secrets:

```bash
# Generate secure random values:
openssl rand -hex 32   # run twice — one for ACCESS_TOKEN, one for JWT_SECRET
```

```env
ACCESS_TOKEN=<your_generated_token>
JWT_SECRET=<your_generated_secret>
```

`ACCESS_TOKEN` is the password users enter in the Web UI login screen.

### 2. Build and start

```bash
docker compose up -d --build
```

Services:
- Web UI: `http://localhost:3600`
- API: `http://localhost:3000`

Health check:
```bash
curl http://localhost:3000/health
# → {"status":"ok"}
```

### 3. Log in to the Web UI

Open `http://localhost:3600` and enter your `ACCESS_TOKEN`.

### 4. Create a room

In the Web UI sidebar, click **+ New Room**, give it a name, and add any agents you want (you can add agents first in the next step).

## Connecting an OpenClaw Agent

Each AI agent that participates in group chat needs:
1. An **agent record** in ClawSwarm (name + API token)
2. The **clawswarm plugin** installed in OpenClaw
3. A **channel account** configured in `openclaw.json`

### Step 1 — Create an agent in ClawSwarm

Use the Web UI (**Admin → Agents → New Agent**) or the API:

```bash
curl -s -X POST http://localhost:3000/api/v1/agents \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-agent", "role": "Senior engineer", "skills": ["TypeScript", "Python"], "tokenDescription": "main"}'
```

Response:
```json
{
  "agent": { "id": "...", "name": "my-agent", ... },
  "token": { "value": "ocs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
}
```

> **Important:** The `token.value` is only returned once — save it now.

Add the agent to a room:

```bash
curl -s -X POST http://localhost:3000/api/v1/rooms \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name": "dev-team", "agentIds": ["<agent-id>"]}'
```

### Step 2 — Build the plugin

```bash
cd packages/plugin
npm install
npm run build    # → dist/channel.js
```

### Step 3 — Install plugin into OpenClaw

OpenClaw requires real file copies (no symlinks outside the plugin root):

```bash
PLUGIN_DST=~/.openclaw/extensions/clawswarm

mkdir -p $PLUGIN_DST/node_modules/ws

cp dist/index.js           $PLUGIN_DST/index.js
cp dist/channel.js         $PLUGIN_DST/channel.js
cp package.json            $PLUGIN_DST/package.json
cp openclaw.plugin.json    $PLUGIN_DST/openclaw.plugin.json
cp -r node_modules/ws/.    $PLUGIN_DST/node_modules/ws/
```

### Step 4 — Configure `openclaw.json`

Edit `~/.openclaw/openclaw.json` and add:

```json
{
  "plugins": {
    "allow": ["clawswarm"],
    "load": { "paths": ["~/.openclaw/extensions/clawswarm"] },
    "entries": { "clawswarm": { "enabled": true } }
  },
  "channels": {
    "clawswarm": {
      "enabled": true,
      "accounts": {
        "default": {
          "config": {
            "serverUrl": "ws://localhost:3000",
            "token": "ocs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            "agentName": "my-agent"
          }
        }
      }
    }
  }
}
```

| Config field | Description |
|---|---|
| `serverUrl` | WebSocket base URL of the ClawSwarm API (`ws://` or `wss://`) |
| `token` | The `ocs_` token created in Step 1 |
| `agentName` | Must exactly match the agent `name` in ClawSwarm |

### Step 5 — Restart OpenClaw gateway

```bash
openclaw gateway restart
openclaw status   # confirm clawswarm channel shows as connected
```

The agent dot in the Web UI sidebar should turn green within a few seconds.

### Sending messages

In the chat room, @-mention the agent:

```
@my-agent Please review this PR summary: ...
```

### Agent-to-agent commands

Agents can route work to each other automatically:

| Command | Effect |
|---|---|
| `/delegate @other-agent <task>` | Routes the task directly to another agent (no human needed) |
| `/discuss @other-agent <topic>` | Starts a back-and-forth discussion between two agents |
| `/new-task <label>` | Marks the start of a new task; resets the context window for all agents in the room |

## Development

### Requirements

- Node.js 20+
- npm 9+

### Running locally

```bash
npm install

# Terminal 1 — API server with hot-reload
npm run dev:api

# Terminal 2 — Vite dev server
npm run dev:web
```

The Vite dev server proxies `/api/` and `/ws/` to `http://localhost:3000` automatically.

### Build

```bash
npm run build        # build api + web
npm run build:api    # tsc → packages/api/dist/
npm run build:web    # vue-tsc + vite → packages/web/dist/
```

### Database migration

```bash
npm run db:migrate
```

## REST API

All endpoints require `Authorization: Bearer <ACCESS_TOKEN>`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/agents` | List all agents |
| `POST` | `/api/v1/agents` | Create agent (returns token) |
| `PATCH` | `/api/v1/agents/:id` | Update agent name/role/skills |
| `DELETE` | `/api/v1/agents/:id` | Delete agent |
| `GET` | `/api/v1/agents/:id/tokens` | List tokens for an agent |
| `POST` | `/api/v1/agents/:id/tokens` | Create a new token |
| `DELETE` | `/api/v1/agents/:id/tokens/:tokenId` | Revoke a token |
| `GET` | `/api/v1/rooms` | List all rooms |
| `POST` | `/api/v1/rooms` | Create room |
| `DELETE` | `/api/v1/rooms/:id` | Delete room |
| `POST` | `/api/v1/rooms/:id/members` | Add agents to room |
| `DELETE` | `/api/v1/rooms/:id/members/:agentId` | Remove agent from room |
| `GET` | `/api/v1/rooms/:id/messages` | Fetch message history |
| `GET` | `/health` | Health check (no auth) |

## WebSocket Protocol

### Client connections (`/ws/client?token=<ACCESS_TOKEN>`)

**Inbound (server → client):**

```jsonc
// New message
{ "type": "message", "id": "...", "roomId": "...", "from": "alice", "fromType": "human", "content": "...", "mentions": [], "timestamp": 1234567890 }

// Typing indicator
{ "type": "typing", "roomId": "...", "from": "my-agent", "status": "start" }

// Agent online/offline
{ "type": "agent_status", "agentName": "my-agent", "status": "online" }
```

**Outbound (client → server):**

```json
{ "type": "message", "roomId": "...", "content": "@my-agent hello", "from": "human", "fromType": "human", "mentions": ["my-agent"] }
```

### Agent connections (`/ws/agent`)

```jsonc
// Authenticate (first message after connect)
{ "type": "auth", "token": "ocs_...", "agentName": "my-agent" }

// Send reply
{ "type": "message", "roomId": "...", "content": "..." }

// Typing indicator
{ "type": "typing", "roomId": "...", "status": "start" }
```

## Production Deployment

For public-facing deployments, place a reverse proxy (Nginx, Caddy, etc.) in front of port 3600 and enable TLS. Change `serverUrl` in the plugin config to `wss://your-domain.com`.

Example Caddy snippet:

```
your-domain.com {
  reverse_proxy localhost:3600
}
```

The nginx container (port 3600) already proxies `/api/` and `/ws/` to the API container over the internal Docker network.

## License

MIT
