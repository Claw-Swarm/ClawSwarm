import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { getDb } from '../db';
import type { RoomRow, AgentRow, MessageRow, RequirementMarkRow } from '../types';

export async function roomRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  app.get('/rooms', async (_req, reply) => {
    const rows = db.prepare('SELECT * FROM rooms ORDER BY created_at DESC').all() as RoomRow[];
    const rooms = rows.map((r) => {
      const members = db.prepare(`
        SELECT a.id AS agentId, a.name AS agentName, a.status FROM room_members rm
        JOIN agents a ON a.id = rm.agent_id
        WHERE rm.room_id = ?
      `).all(r.id) as Array<{ agentId: string; agentName: string; status: string }>;
      return {
        id: r.id,
        name: r.name,
        createdAt: r.created_at,
        members,
      };
    });
    return reply.send({ rooms });
  });

  app.get<{ Params: { id: string } }>('/rooms/:id', async (req, reply) => {
    const row = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id) as RoomRow | undefined;
    if (!row) return reply.status(404).send({ error: 'Room not found' });

    const members = db.prepare(`
      SELECT a.id AS agentId, a.name AS agentName, a.status FROM room_members rm
      JOIN agents a ON a.id = rm.agent_id
      WHERE rm.room_id = ?
    `).all(req.params.id) as Array<{ agentId: string; agentName: string; status: string }>;

    return reply.send({
      room: {
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        members,
      },
    });
  });

  app.post<{
    Body: { name: string; agentIds?: string[] }
  }>('/rooms', async (req, reply) => {
    const { name, agentIds = [] } = req.body;
    if (!name) return reply.status(400).send({ error: 'name is required' });

    const id = randomUUID();
    const createdAt = Date.now();
    db.prepare('INSERT INTO rooms (id, name, created_at) VALUES (?, ?, ?)').run(id, name, createdAt);

    const joinedAt = Date.now();
    for (const agentId of agentIds) {
      const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(agentId);
      if (agent) {
        const existing = db.prepare(
          'SELECT 1 FROM room_members WHERE room_id = ? AND agent_id = ?'
        ).get(id, agentId);
        if (!existing) {
          db.prepare(
            'INSERT INTO room_members (room_id, agent_id, joined_at) VALUES (?, ?, ?)'
          ).run(id, agentId, joinedAt);
        }
      }
    }

    const members = db.prepare(`
      SELECT a.id AS agentId, a.name AS agentName, a.status FROM room_members rm
      JOIN agents a ON a.id = rm.agent_id
      WHERE rm.room_id = ?
    `).all(id) as Array<{ agentId: string; agentName: string; status: string }>;

    return reply.status(201).send({ room: { id, name, createdAt, members } });
  });

  app.put<{
    Params: { id: string };
    Body: { name?: string }
  }>('/rooms/:id', async (req, reply) => {
    const row = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id) as RoomRow | undefined;
    if (!row) return reply.status(404).send({ error: 'Room not found' });

    const name = req.body.name ?? row.name;
    db.prepare('UPDATE rooms SET name = ? WHERE id = ?').run(name, req.params.id);

    return reply.send({ room: { id: row.id, name, createdAt: row.created_at } });
  });

  app.delete<{ Params: { id: string } }>('/rooms/:id', async (req, reply) => {
    const row = db.prepare('SELECT id FROM rooms WHERE id = ?').get(req.params.id);
    if (!row) return reply.status(404).send({ error: 'Room not found' });
    db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.id);
    return reply.status(200).send({ success: true });
  });

  app.post<{
    Params: { id: string };
    Body: { agentIds: string[] }
  }>('/rooms/:id/members', async (req, reply) => {
    const { id: roomId } = req.params;
    const { agentIds } = req.body;

    if (!agentIds || !Array.isArray(agentIds)) {
      return reply.status(400).send({ error: 'agentIds array is required' });
    }

    const room = db.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId);
    if (!room) return reply.status(404).send({ error: 'Room not found' });

    const joinedAt = Date.now();
    for (const agentId of agentIds) {
      const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(agentId) as AgentRow | undefined;
      if (!agent) continue;
      const existing = db.prepare(
        'SELECT 1 FROM room_members WHERE room_id = ? AND agent_id = ?'
      ).get(roomId, agentId);
      if (!existing) {
        db.prepare(
          'INSERT INTO room_members (room_id, agent_id, joined_at) VALUES (?, ?, ?)'
        ).run(roomId, agentId, joinedAt);
      }
    }

    return reply.status(200).send({ success: true });
  });

  app.delete<{ Params: { id: string; agentId: string } }>(
    '/rooms/:id/members/:agentId',
    async (req, reply) => {
      const { id: roomId, agentId } = req.params;
      const existing = db.prepare(
        'SELECT 1 FROM room_members WHERE room_id = ? AND agent_id = ?'
      ).get(roomId, agentId);
      if (!existing) return reply.status(404).send({ error: 'Member not found' });
      db.prepare('DELETE FROM room_members WHERE room_id = ? AND agent_id = ?').run(roomId, agentId);
      return reply.status(200).send({ success: true });
    }
  );

  app.get<{
    Params: { id: string };
    Querystring: { limit?: string; before?: string }
  }>('/rooms/:id/messages', async (req, reply) => {
    const { id: roomId } = req.params;
    const limit  = Math.min(parseInt(req.query.limit  ?? '50', 10), 200);
    const before = req.query.before ? parseInt(req.query.before, 10) : null;

    const room = db.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId);
    if (!room) return reply.status(404).send({ error: 'Room not found' });

    let rows: MessageRow[];
    if (before !== null) {
      rows = db.prepare(
        'SELECT * FROM messages WHERE room_id = ? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?'
      ).all(roomId, before, limit) as MessageRow[];
    } else {
      rows = db.prepare(
        'SELECT * FROM messages WHERE room_id = ? ORDER BY timestamp DESC LIMIT ?'
      ).all(roomId, limit) as MessageRow[];
    }

    const messages = rows.reverse().map((m) => ({
      id: m.id,
      roomId: m.room_id,
      from: m.from_id,
      fromType: m.from_type,
      content: m.content,
      mentions: JSON.parse(m.mentions) as string[],
      timestamp: m.timestamp,
    }));

    const hasMore = rows.length === limit;

    return reply.send({ messages, hasMore });
  });

  app.post<{
    Params: { id: string };
    Body: { label?: string }
  }>('/rooms/:id/new-task', async (req, reply) => {
    const { id: roomId } = req.params;
    const label = req.body?.label ?? '';

    const room = db.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId);
    if (!room) return reply.status(404).send({ error: 'Room not found' });

    const id = randomUUID();
    const markedAt = Date.now();
    db.prepare(
      'INSERT INTO requirement_marks (id, room_id, label, marked_at) VALUES (?, ?, ?, ?)'
    ).run(id, roomId, label, markedAt);

    return reply.status(201).send({ id, roomId, label, markedAt });
  });

  app.get<{ Params: { id: string } }>('/rooms/:id/tasks', async (req, reply) => {
    const { id: roomId } = req.params;
    const room = db.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId);
    if (!room) return reply.status(404).send({ error: 'Room not found' });

    const marks = db
      .prepare('SELECT * FROM requirement_marks WHERE room_id = ? ORDER BY marked_at ASC')
      .all(roomId) as RequirementMarkRow[];

    const allMarks = [
      { id: '__initial__', label: '（初始对话）', marked_at: 0 } as RequirementMarkRow,
      ...marks,
    ];

    const tasks = allMarks.map((mark, idx) => {
      const from = mark.marked_at;
      const to = allMarks[idx + 1]?.marked_at ?? null;

      const countRow = to !== null
        ? db.prepare('SELECT COUNT(*) as cnt FROM messages WHERE room_id = ? AND timestamp >= ? AND timestamp < ?').get(roomId, from, to) as { cnt: number }
        : db.prepare('SELECT COUNT(*) as cnt FROM messages WHERE room_id = ? AND timestamp >= ?').get(roomId, from) as { cnt: number };

      return {
        markId: mark.id,
        label: mark.label ?? mark.id,
        startedAt: mark.marked_at,
        messageCount: countRow.cnt,
      };
    }).filter((t) => t.messageCount > 0);

    return reply.send({ tasks });
  });

  app.delete<{
    Params: { id: string };
    Body: { markIds: string[] }
  }>('/rooms/:id/tasks', async (req, reply) => {
    const { id: roomId } = req.params;
    const { markIds } = req.body;

    if (!markIds || !Array.isArray(markIds) || markIds.length === 0) {
      return reply.status(400).send({ error: 'markIds array is required' });
    }

    const room = db.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId);
    if (!room) return reply.status(404).send({ error: 'Room not found' });

    const allMarks = [
      { id: '__initial__', marked_at: 0 } as RequirementMarkRow,
      ...(db.prepare('SELECT * FROM requirement_marks WHERE room_id = ? ORDER BY marked_at ASC').all(roomId) as RequirementMarkRow[]),
    ];

    const deleteMessages = db.prepare('DELETE FROM messages WHERE room_id = ? AND timestamp >= ? AND timestamp < ?');
    const deleteMessagesTail = db.prepare('DELETE FROM messages WHERE room_id = ? AND timestamp >= ?');
    const deleteMark = db.prepare('DELETE FROM requirement_marks WHERE id = ?');

    const doDelete = db.transaction(() => {
      for (const markId of markIds) {
        const idx = allMarks.findIndex((m) => m.id === markId);
        if (idx === -1) continue;

        const from = allMarks[idx].marked_at;
        const nextMark = allMarks[idx + 1];

        if (nextMark) {
          deleteMessages.run(roomId, from, nextMark.marked_at);
        } else {
          deleteMessagesTail.run(roomId, from);
        }

        if (markId !== '__initial__') {
          deleteMark.run(markId);
        }
      }
    });

    doDelete();
    return reply.send({ success: true });
  });

  app.get<{ Params: { id: string } }>('/rooms/:id/messages/since-task', async (req, reply) => {
    const { id: roomId } = req.params;

    const room = db.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId);
    if (!room) return reply.status(404).send({ error: 'Room not found' });

    const mark = db
      .prepare('SELECT * FROM requirement_marks WHERE room_id = ? ORDER BY marked_at DESC LIMIT 1')
      .get(roomId) as RequirementMarkRow | undefined;

    const messages = mark
      ? (db.prepare(
          'SELECT * FROM messages WHERE room_id = ? AND timestamp >= ? ORDER BY timestamp ASC'
        ).all(roomId, mark.marked_at) as MessageRow[])
      : [];

    return reply.send({
      mark: mark
        ? { id: mark.id, label: mark.label, markedAt: mark.marked_at }
        : null,
      messages: messages.map((m) => ({
        id: m.id,
        roomId: m.room_id,
        from: m.from_id,
        fromType: m.from_type,
        content: m.content,
        mentions: JSON.parse(m.mentions) as string[],
        timestamp: m.timestamp,
      })),
    });
  });

  app.get<{ Params: { id: string } }>('/rooms/:id/context', async (req, reply) => {
    const { id: roomId } = req.params;

    const room = db.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId);
    if (!room) return reply.status(404).send({ error: 'Room not found' });

    const mark = db
      .prepare('SELECT * FROM requirement_marks WHERE room_id = ? ORDER BY marked_at DESC LIMIT 1')
      .get(roomId) as RequirementMarkRow | undefined;

    let messages: MessageRow[];
    if (mark) {
      messages = db
        .prepare(
          'SELECT * FROM messages WHERE room_id = ? AND timestamp >= ? ORDER BY timestamp ASC'
        )
        .all(roomId, mark.marked_at) as MessageRow[];
    } else {
      messages = db
        .prepare('SELECT * FROM messages WHERE room_id = ? ORDER BY timestamp DESC LIMIT 20')
        .all(roomId) as MessageRow[];
      messages.reverse();
    }

    return reply.send({
      mark: mark
        ? { id: mark.id, roomId: mark.room_id, label: mark.label, markedAt: mark.marked_at }
        : null,
      messages: messages.map((m) => ({
        id: m.id,
        roomId: m.room_id,
        from: m.from_id,
        fromType: m.from_type,
        content: m.content,
        mentions: JSON.parse(m.mentions) as string[],
        timestamp: m.timestamp,
      })),
    });
  });
}
