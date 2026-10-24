import path from 'node:path';
import { config } from '../config.js';
import { getDb } from './index.js';

const db = getDb();
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all() as { name: string }[];
console.log(`Database ready: ${path.join(config.dataDir, 'yummytime.db')}`);
console.log(`Tables: ${tables.map((t) => t.name).join(', ')}`);
