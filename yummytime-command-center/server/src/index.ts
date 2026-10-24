import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { ROOT_DIR, config, integrationStatus } from './config.js';
import { getDb } from './db/index.js';
import * as repo from './db/repo.js';
import { attachWebSocket } from './ws.js';
import { api } from './routes.js';
import { requireLogin } from './auth.js';
import { twilioWebhooks } from './alerts/routes.js';
import { resumeEscalations } from './alerts/service.js';
import { startMockSimulator } from './mock/simulator.js';
import { startImou } from './imou/sync.js';
import { startAqara } from './aqara/sync.js';
import { restoreTemperatureTracking } from './rules/temperature.js';
import { startRulesEngine } from './rules/engine.js';
import { startScheduler } from './rules/scheduler.js';
import { cleanupOldMedia, syncContinuous } from './cameras/recorder.js';

getDb();
const app = express();
app.use(cors());
// Twilio calls these from the internet; they are verified by Twilio's signature instead of the app password
app.use('/api/twilio', twilioWebhooks);
app.use(requireLogin);
app.use(express.json());
app.use('/api', api);

// Production: serve the built dashboard from the same port (npm run build && npm start)
const webDist = path.join(ROOT_DIR, 'web', 'dist');
if (fs.existsSync(path.join(webDist, 'index.html'))) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api\/|ws).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

const server = http.createServer(app);
attachWebSocket(server);

startRulesEngine();
restoreTemperatureTracking();
if (config.mockMode) startMockSimulator();
if (integrationStatus().imou) startImou();
if (integrationStatus().aqara) startAqara();
startScheduler();
resumeEscalations();
syncContinuous(repo.getLocation().id);
cleanupOldMedia();
setInterval(cleanupOldMedia, 6 * 3600_000);

server.listen(config.port, () => {
  console.log(`YummyTime Command Center server on http://localhost:${config.port}`);
  console.log(`Location: ${config.locationName} | mock mode: ${config.mockMode} | login: ${config.appPassword ? 'password' : 'OPEN (set APP_PASSWORD)'}`);
  console.log('Integrations configured:', integrationStatus());
});
