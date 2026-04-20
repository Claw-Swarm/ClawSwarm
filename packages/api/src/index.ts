import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { agentRoutes } from './routes/agents';
import { tokenRoutes } from './routes/tokens';
import { roomRoutes } from './routes/rooms';
import { attachWebSocketServers } from './ws';
import { getDb } from './db';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

async function main(): Promise<void> {
  // Initialize DB early so schema is applied
  getDb();

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  // ── Security / CORS ──────────────────────────────────────────────────────
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // ── Access token auth (all /api/v1/* routes) ─────────────────────────────
  const ACCESS_TOKEN = process.env.ACCESS_TOKEN ?? '';
  if (!ACCESS_TOKEN) {
    app.log.warn('ACCESS_TOKEN is not set — API is unprotected!');
  }
  app.addHook('onRequest', async (req, reply) => {
    if (!ACCESS_TOKEN) return;
    if (!req.url.startsWith('/api/')) return;
    const auth = req.headers['authorization'] ?? '';
    if (auth !== `Bearer ${ACCESS_TOKEN}`) {
      reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing token' } });
    }
  });

  // ── API routes ───────────────────────────────────────────────────────────
  await app.register(agentRoutes, { prefix: '/api/v1' });
  await app.register(tokenRoutes, { prefix: '/api/v1' });
  await app.register(roomRoutes,  { prefix: '/api/v1' });

  // ── Health check ─────────────────────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', timestamp: Date.now() }));

  // ── Start HTTP server ────────────────────────────────────────────────────
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`ClawSwarm API listening on ${HOST}:${PORT}`);

  // ── Attach WebSocket upgrade handler ─────────────────────────────────────
  const server = app.server;
  attachWebSocketServers(server, ACCESS_TOKEN);
  app.log.info('WebSocket servers attached at /ws/agent and /ws/client');
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
