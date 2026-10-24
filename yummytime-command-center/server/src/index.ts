import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { config, integrationStatus } from './config.js';
import { getDb } from './db/index.js';
import { attachWebSocket } from './ws.js';
import { api } from './routes.js';
import { startMockSimulator } from './mock/simulator.js';
import { startImou } from './imou/sync.js';
import { startAqara } from './aqara/sync.js';
import { restoreTemperatureTracking } from './rules/temperature.js';
import { cleanupOldMedia, syncContinuous } from './cameras/recorder.js';
import * as repo from './db/repo.js';

getDb();
const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', api);

const server = http.createServer(app);
attachWebSocket(server);

restoreTemperatureTracking();
if (config.mockMode) startMockSimulator();
if (integrationStatus().aqara) startAqara();
if (integrationStatus().imou) startImou();
syncContinuous(repo.getLocation().id);
cleanupOldMedia();
setInterval(cleanupOldMedia, 6 * 3600_000);

server.listen(config.port, () => {
  console.log(`YummyTime Command Center server on http://localhost:${config.port}`);
  console.log(`Location: ${config.locationName} | mock mode: ${config.mockMode}`);
  console.log('Integrations configured:', integrationStatus());
});
