import { Router } from 'express';
import { config, integrationStatus } from './config.js';
import * as repo from './db/repo.js';
import { runScenario, type Scenario } from './mock/scenarios.js';
import { devices, schedule } from './devices/routes.js';
import { armLocation } from './rules/scheduler.js';
import { alertsApi } from './alerts/routes.js';
import { reports } from './reports/routes.js';
import { ffmpegBinary } from './cameras/recorder.js';
import { cameras } from './cameras/routes.js';
import { aqaraRoutes } from './aqara/routes.js';

export const api = Router();
api.use('/devices', devices);
api.use('/location/schedule', schedule);
api.use('/cameras', cameras);
api.use('/aqara', aqaraRoutes);
api.use('/reports', reports);
api.use('/', alertsApi);

api.get('/health', (_req, res) => {
  const location = repo.getLocation();
  res.json({
    ok: true,
    serverTime: new Date().toISOString(),
    mockMode: config.mockMode,
    location,
    deviceCount: repo.listDevices(location.id).length,
    integrations: integrationStatus(),
    recorder: ffmpegBinary() ? 'ready' : 'ffmpeg missing',
  });
});

/** Everything the dashboard needs in one call; live changes then arrive over /ws. */
api.get('/dashboard', (_req, res) => {
  const location = repo.getLocation();
  res.json({
    location,
    mockMode: config.mockMode,
    devices: repo.listDevices(location.id),
    events: repo.listEvents(location.id, 50),
    alerts: repo.listActiveAlerts(location.id),
  });
});

api.post('/location/arm', (req, res) => {
  res.json(armLocation(Boolean(req.body?.armed), String(req.body?.by ?? 'Hooman')));
});

const SCENARIOS: Scenario[] = ['smoke', 'intrusion', 'temperature', 'reset'];

api.post('/mock/scenario/:name', (req, res) => {
  if (!config.mockMode) return res.status(400).json({ error: 'Only available in MOCK_MODE' });
  const name = req.params.name as Scenario;
  if (!SCENARIOS.includes(name)) return res.status(400).json({ error: `Use one of: ${SCENARIOS.join(', ')}` });
  try {
    runScenario(name);
    res.json({ ok: true });
  } catch (e) {
    res.status(409).json({ error: (e as Error).message });
  }
});
