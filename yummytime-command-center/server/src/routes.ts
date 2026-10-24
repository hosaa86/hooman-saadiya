import { Router } from 'express';
import { config, integrationStatus } from './config.js';
import * as repo from './db/repo.js';
import { broadcast } from './ws.js';
import { runScenario, type Scenario } from './mock/scenarios.js';
import { devices, schedule } from './devices/routes.js';
import { ffmpegBinary } from './cameras/recorder.js';
import { cameras } from './cameras/routes.js';

export const api = Router();
api.use('/devices', devices);
api.use('/location/schedule', schedule);
api.use('/cameras', cameras);

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
  const armed = Boolean(req.body?.armed);
  const by = String(req.body?.by ?? 'Hooman');
  const location = repo.setArmed(armed, by);
  broadcast({ type: 'location', location });
  broadcast({
    type: 'event',
    event: repo.addEvent(location.id, {
      type: armed ? 'armed' : 'disarmed',
      severity: 'info',
      message: `${armed ? 'Armed' : 'Disarmed'} by ${by}`,
    }),
  });
  res.json(location);
});

api.post('/alerts/:id/ack', (req, res) => {
  const by = String(req.body?.by ?? 'Hooman');
  const alert = repo.acknowledgeAlert(Number(req.params.id), by);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  broadcast({ type: 'alert', alert });
  broadcast({
    type: 'event',
    event: repo.addEvent(repo.getLocation().id, {
      type: 'acknowledged',
      severity: 'info',
      message: `"${alert.title}" acknowledged by ${by}`,
    }),
  });
  res.json(alert);
});

const SCENARIOS: Scenario[] = ['smoke', 'intrusion', 'temperature', 'reset'];

api.post('/mock/scenario/:name', (req, res) => {
  if (!config.mockMode) return res.status(400).json({ error: 'Only available in MOCK_MODE' });
  const name = req.params.name as Scenario;
  if (!SCENARIOS.includes(name)) return res.status(400).json({ error: `Use one of: ${SCENARIOS.join(', ')}` });
  res.json({ ok: true, alert: runScenario(name) });
});
