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
  seed(db);
  return db;
}
