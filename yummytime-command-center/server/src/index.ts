import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { config, integrationStatus } from './config.js';
import { getDb } from './db/index.js';
import { attachWebSocket } from './ws.js';

const db = getDb();
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  const location = db.prepare('SELECT id, name, armed FROM locations WHERE name = ?').get(config.locationName);
  const deviceCount = (db.prepare('SELECT COUNT(*) AS n FROM devices').get() as { n: number }).n;
  res.json({
    ok: true,
    serverTime: new Date().toISOString(),
    mockMode: config.mockMode,
    location,
    deviceCount,
    integrations: integrationStatus(),
  });
});

const server = http.createServer(app);
attachWebSocket(server);

server.listen(config.port, () => {
  console.log(`YummyTime Command Center server on http://localhost:${config.port}`);
  console.log(`Location: ${config.locationName} | mock mode: ${config.mockMode}`);
  console.log('Integrations configured:', integrationStatus());
});
