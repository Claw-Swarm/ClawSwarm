import { FastifyInstance } from 'fastify';
import { randomUUID, randomBytes } from 'crypto';
import { getDb } from '../db';
import type { AgentRow } from '../types';

function rowToAgent(r: AgentRow) {
  return {
    id: r.id,
    name: r.name,
    nickname: r.nickname ?? '',
    icon: r.icon ?? '',
    role: r.role,
    skills: JSON.parse(r.skills) as string[],
    status: r.status,
    createdAt: r.created_at,
  };
}

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  app.get('/agents', async (_req, reply) => {
    const rows = db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all() as AgentRow[];
    return reply.send({ agents: rows.map(rowToAgent) });
  });

  app.get<{ Params: { id: string } }>('/agents/:id', async (req, reply) => {
    const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as AgentRow | undefined;
    if (!row) return reply.status(404).send({ error: 'Agent not found' });
    return reply.send({ agent: rowToAgent(row) });
  });

  app.post<{
    Body: { name: string; role?: string; icon?: string; skills?: string[]; tokenDescription?: string }
  }>('/agents', async (req, reply) => {
    const { name, role = '', icon = '', skills = [], tokenDescription = '' } = req.body;
    if (!name) return reply.status(400).send({ error: 'name is required' });

    const existing = db.prepare('SELECT id FROM agents WHERE name = ?').get(name);
    if (existing) return reply.status(409).send({ error: 'Agent name already exists' });

    const agentId = randomUUID();
    const agentCreatedAt = Date.now();
    db.prepare(
      'INSERT INTO agents (id, name, nickname, icon, role, skills, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(agentId, name, '', icon, role, JSON.stringify(skills), 'offline', agentCreatedAt);

    const tokenValue = `ocs_${randomBytes(24).toString('hex')}`;
    const tokenId = randomUUID();
    const tokenCreatedAt = Date.now();
    db.prepare(
      'INSERT INTO tokens (id, agent_id, token, description, revoked, created_at) VALUES (?, ?, ?, ?, 0, ?)'
    ).run(tokenId, agentId, tokenValue, tokenDescription, tokenCreatedAt);

    return reply.status(201).send({
      agent: { id: agentId, name, nickname: '', icon, role, skills, status: 'offline', createdAt: agentCreatedAt },
      token: { id: tokenId, token: tokenValue, description: tokenDescription, revoked: false, createdAt: tokenCreatedAt },
    });
  });

  app.patch<{
    Params: { id: string };
    Body: { name?: string; nickname?: string; icon?: string; role?: string; skills?: string[] }
  }>('/agents/:id', async (req, reply) => {
    const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as AgentRow | undefined;
    if (!row) return reply.status(404).send({ error: 'Agent not found' });

    const name     = req.body.name     ?? row.name;
    const nickname = req.body.nickname ?? row.nickname ?? '';
    const icon     = req.body.icon     ?? row.icon ?? '';
    const role     = req.body.role     ?? row.role;
    const skills   = req.body.skills   ?? (JSON.parse(row.skills) as string[]);

    db.prepare(
      'UPDATE agents SET name = ?, nickname = ?, icon = ?, role = ?, skills = ? WHERE id = ?'
    ).run(name, nickname, icon, role, JSON.stringify(skills), req.params.id);

    return reply.send({ agent: { id: row.id, name, nickname, icon, role, skills, status: row.status, createdAt: row.created_at } });
  });

  app.delete<{ Params: { id: string } }>('/agents/:id', async (req, reply) => {
    const row = db.prepare('SELECT id FROM agents WHERE id = ?').get(req.params.id);
    if (!row) return reply.status(404).send({ error: 'Agent not found' });
    db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id);
    return reply.status(200).send({ success: true });
  });
}
