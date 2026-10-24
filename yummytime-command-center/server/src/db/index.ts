import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { seed } from './seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export type DB = Database.Database;

let db: DB | null = null;

/** Open (and create/migrate if needed) the local SQLite database. */
export function getDb(): DB {
  if (db) return db;
  fs.mkdirSync(config.dataDir, { recursive: true });
  db = new Database(path.join(config.dataDir, 'yummytime.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // schema.sql lives next to this file in src/; fall back to src/ when running from dist/
  const schemaPath = [path.join(here, 'schema.sql'), path.resolve(here, '../../src/db/schema.sql')].find((p) =>
    fs.existsSync(p),
  );
  if (!schemaPath) throw new Error('schema.sql not found');
  db.exec(fs.readFileSync(schemaPath, 'utf8'));
  migrate(db);
  seed(db);
  return db;
}

/** Upgrades for databases created by an earlier schema.sql. */
function migrate(db: DB) {
  const has = (table: string, col: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === col);
  if (!has('devices', 'archived_at')) db.exec('ALTER TABLE devices ADD COLUMN archived_at TEXT');
  db.exec('INSERT OR IGNORE INTO schema_version (version) VALUES (2)');
}
