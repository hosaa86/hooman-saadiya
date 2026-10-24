import { Router } from 'express';
import * as repo from '../db/repo.js';
import { broadcast } from '../ws.js';
import { temperatureStatus, type SensorLimits } from '../status.js';
import type { Category } from '../types.js';
import { FIELD_OPTIONS, KINDS, defaultSettings, validateSettings } from './defaults.js';

export const devices = Router();

const CATEGORIES = Object.keys(KINDS) as Category[];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

devices.get('/meta', (_req, res) => res.json({ fieldOptions: FIELD_OPTIONS, kinds: KINDS }));

devices.get('/', (_req, res) => res.json(repo.listDevices(repo.getLocation().id)));

devices.post('/', (req, res) => {
  const { category, kind, name, externalId } = req.body ?? {};
  if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Unknown category' });
  if (!KINDS[category as Category].includes(kind)) return res.status(400).json({ error: 'Unknown device type' });
  if (!String(name ?? '').trim()) return res.status(400).json({ error: 'Name is required' });
  const loc = repo.getLocation();
  const device = repo.createDevice(loc.id, { category, kind, name: String(name).trim(), externalId });
  changed(loc.id, `Device added: ${device.name}`);
  res.status(201).json(device);
});

devices.put('/order', (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || !ids.every(Number.isInteger)) return res.status(400).json({ error: 'ids must be an array of device ids' });
  repo.reorderDevices(ids);
  broadcast({ type: 'devices_changed' });
  res.json({ ok: true });
});

devices.patch('/:id', (req, res) => {
  const device = repo.getDevice(Number(req.params.id));
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const { name, visibleFields, settings } = req.body ?? {};

  if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: 'Name is required' });
  if (visibleFields !== undefined) {
    const allowed = Object.keys(FIELD_OPTIONS[device.category]);
    if (!Array.isArray(visibleFields) || !visibleFields.every((f) => allowed.includes(f)))
      return res.status(400).json({ error: `Visible fields must be from: ${allowed.join(', ')}` });
  }
  let merged: Record<string, unknown> | undefined;
  if (settings !== undefined) {
    const next = { ...defaultSettings(device.kind), ...device.settings, ...settings };
    const err = validateSettings(device.kind, next);
    if (err) return res.status(400).json({ error: err });
    merged = next;
  }

  let updated = repo.updateDevice(device.id, { name: name?.trim(), visibleFields, settings: merged });
  // New limits apply immediately to the current reading
  if (updated.kind === 'temperature' && updated.online && updated.lastValue != null) {
    updated = repo.updateDeviceState(updated.id, { status: temperatureStatus(updated.lastValue, updated.settings as unknown as SensorLimits) });
  }
  broadcast({ type: 'device_update', device: updated });
  res.json(updated);
});

devices.delete('/:id', (req, res) => {
  const device = repo.getDevice(Number(req.params.id));
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const result = repo.deleteDevice(device.id);
  changed(device.locationId, result === 'archived' ? `Device removed: ${device.name} (temperature log kept)` : `Device removed: ${device.name}`);
  res.json({ result });
});

/** Detector self-test: shows the alarm state briefly and logs it. Never sends calls/messages. */
devices.post('/:id/test', (req, res) => {
  const device = repo.getDevice(Number(req.params.id));
  if (!device || device.category !== 'detector') return res.status(404).json({ error: 'Detector not found' });
  if (!device.online) return res.status(409).json({ error: `${device.name} is offline` });
  const alarmState = { smoke: 'smoke', door: 'open', vibration: 'vibration' }[device.kind] ?? 'test';
  broadcast({ type: 'device_update', device: { ...device, lastState: alarmState, status: 'warning' } });
  broadcast({
    type: 'event',
    event: repo.addEvent(device.locationId, { deviceId: device.id, type: 'test', severity: 'info', message: `Test: ${device.name} triggered (no alert sent)` }),
  });
  // The DB was never changed, so re-sending the stored device restores the real state
  setTimeout(() => {
    const current = repo.getDevice(device.id);
    if (current) broadcast({ type: 'device_update', device: current });
  }, 4000);
  res.json({ ok: true });
});

export const schedule = Router();

schedule.get('/', (_req, res) => res.json(repo.getSchedule(repo.getLocation().id)));

schedule.put('/', (req, res) => {
  const { enabled, days, armTime, disarmTime } = req.body ?? {};
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be true/false' });
  if (!Array.isArray(days) || !days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7))
    return res.status(400).json({ error: 'days must be 1–7 (Mon–Sun)' });
  if (!TIME.test(armTime) || !TIME.test(disarmTime)) return res.status(400).json({ error: 'Times must be HH:MM' });
  const loc = repo.getLocation();
  const s = repo.setSchedule(loc.id, { enabled, days: [...new Set(days as number[])].sort(), armTime, disarmTime });
  broadcast({
    type: 'event',
    event: repo.addEvent(loc.id, {
      type: 'system',
      severity: 'info',
      message: s.enabled ? `Night mode schedule: arm ${s.armTime}, disarm ${s.disarmTime}` : 'Night mode schedule turned off',
    }),
  });
  res.json(s);
});

function changed(locationId: number, message: string) {
  broadcast({ type: 'devices_changed' });
  broadcast({ type: 'event', event: repo.addEvent(locationId, { type: 'system', severity: 'info', message }) });
}
