import { FastifyInstance } from 'fastify';
import { randomUUID, randomBytes } from 'crypto';
import { getDb } from '../db';
import type { TokenRow } from '../types';

export async function tokenRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  app.get<{ Params: { agentId: string } }>('/agents/:agentId/tokens', async (req, reply) => {
    const { agentId } = req.params;
    const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(agentId);
    if (!agent) return reply.status(404).send({ error: 'Agent not found' });

    const rows = db.prepare(
      'SELECT * FROM tokens WHERE agent_id = ? AND revoked = 0 ORDER BY created_at DESC'
    ).all(agentId) as TokenRow[];

    return reply.send({
      tokens: rows.map((r) => ({
        id: r.id,
        agentId: r.agent_id,
        description: r.description,
        revoked: r.revoked === 1,
        createdAt: r.created_at,
      })),
    });
  });

  app.post<{
    Params: { agentId: string };
    Body: { description?: string }
  }>('/agents/:agentId/tokens', async (req, reply) => {
    const { agentId } = req.params;
    const { description = '' } = req.body;

    const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(agentId);
    if (!agent) return reply.status(404).send({ error: 'Agent not found' });

    const tokenValue = `ocs_${randomBytes(24).toString('hex')}`;
    const id = randomUUID();
    const createdAt = Date.now();

    db.prepare(
      'INSERT INTO tokens (id, agent_id, token, description, revoked, created_at) VALUES (?, ?, ?, ?, 0, ?)'
    ).run(id, agentId, tokenValue, description, createdAt);

    return reply.status(201).send({
      token: {
        id,
        token: tokenValue,
        description,
        revoked: false,
        createdAt,
      },
    });
  });

  app.delete<{ Params: { agentId: string; tokenId: string } }>(
    '/agents/:agentId/tokens/:tokenId',
    async (req, reply) => {
      const { agentId, tokenId } = req.params;
      const row = db.prepare(
        'SELECT id FROM tokens WHERE id = ? AND agent_id = ?'
      ).get(tokenId, agentId);
      if (!row) return reply.status(404).send({ error: 'Token not found' });
      db.prepare('UPDATE tokens SET revoked = 1 WHERE id = ?').run(tokenId);
      return reply.status(200).send({ success: true });
    }
  );
}
