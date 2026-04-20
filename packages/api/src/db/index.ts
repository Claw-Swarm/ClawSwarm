import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = process.env.DB_PATH ?? './data/clawswarm.db';
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  const schemaSql = fs.readFileSync(
    path.join(__dirname, 'schema.sql'),
    'utf-8'
  );

  for (const stmt of schemaSql.split(';').map((s) => s.trim()).filter(Boolean)) {
    try {
      _db.exec(stmt + ';');
    } catch (err: unknown) {
      if ((err as Error).message?.includes('duplicate column name')) continue;
      throw err;
    }
  }

  return _db;
}

export default getDb;
