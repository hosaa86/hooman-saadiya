import { getDb } from './index.js';
import { config } from '../config.js';
import type { Alert, Device, EventRow, Location, Severity } from '../types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => getDb();

// SQLite stores UTC as 'YYYY-MM-DD HH:MM:SS'; expose ISO with Z so browsers parse it as UTC.
const iso = (s: string | null) => (s ? s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z') : null);

const toDevice = (r: any): Device => ({
  id: r.id,
  locationId: r.location_id,
  category: r.category,
  kind: r.kind,
  provider: r.provider,
  name: r.name,
  sortOrder: r.sort_order,
  visibleFields: JSON.parse(r.visible_fields),
  settings: JSON.parse(r.settings),
  status: r.status,
  online: !!r.online,
  battery: r.battery,
  lastValue: r.last_value,
  lastState: r.last_state,
  lastSeen: iso(r.last_seen),
});

const toEvent = (r: any): EventRow => ({
  id: r.id,
  deviceId: r.device_id,
  deviceName: r.device_name ?? null,
  type: r.type,
  severity: r.severity,
  message: r.message,
  createdAt: iso(r.created_at)!,
});

const toAlert = (r: any): Alert => ({
  id: r.id,
  severity: r.severity,
  title: r.title,
  message: r.message,
  status: r.status,
  acknowledgedBy: r.acknowledged_by,
  acknowledgedAt: iso(r.acknowledged_at),
  createdAt: iso(r.created_at)!,
});

export function getLocation(): Location {
  const r: any = db().prepare('SELECT * FROM locations WHERE name = ?').get(config.locationName);
  return { id: r.id, name: r.name, armed: !!r.armed, armedBy: r.armed_by, armedAt: iso(r.armed_at) };
}

export function setArmed(armed: boolean, by: string): Location {
  db()
    .prepare("UPDATE locations SET armed = ?, armed_by = ?, armed_at = datetime('now') WHERE name = ?")
    .run(armed ? 1 : 0, by, config.locationName);
  return getLocation();
}

export function listDevices(locationId: number): Device[] {
  return db()
    .prepare('SELECT * FROM devices WHERE location_id = ? ORDER BY category, sort_order, id')
    .all(locationId)
    .map(toDevice);
}

export function getDevice(id: number): Device | undefined {
  const r = db().prepare('SELECT * FROM devices WHERE id = ?').get(id);
  return r ? toDevice(r) : undefined;
}

export function updateDeviceState(
  id: number,
  patch: Partial<Pick<Device, 'status' | 'online' | 'battery' | 'lastValue' | 'lastState'>>,
): Device {
  const cols: Record<string, unknown> = {};
  if (patch.status !== undefined) cols.status = patch.status;
  if (patch.online !== undefined) cols.online = patch.online ? 1 : 0;
  if (patch.battery !== undefined) cols.battery = patch.battery;
  if (patch.lastValue !== undefined) cols.last_value = patch.lastValue;
  if (patch.lastState !== undefined) cols.last_state = patch.lastState;
  const sets = Object.keys(cols).map((k) => `${k} = @${k}`);
  sets.push("updated_at = datetime('now')");
  if (patch.online !== false) sets.push("last_seen = datetime('now')");
  db().prepare(`UPDATE devices SET ${sets.join(', ')} WHERE id = @id`).run({ ...cols, id });
  return getDevice(id)!;
}

export function addEvent(
  locationId: number,
  e: { deviceId?: number | null; type: string; severity: Severity; message: string; payload?: unknown },
): EventRow {
  const { lastInsertRowid } = db()
    .prepare('INSERT INTO events (location_id, device_id, type, severity, message, payload) VALUES (?, ?, ?, ?, ?, ?)')
    .run(locationId, e.deviceId ?? null, e.type, e.severity, e.message, JSON.stringify(e.payload ?? {}));
  return listEvents(locationId, 1, Number(lastInsertRowid))[0];
}

export function listEvents(locationId: number, limit = 50, id?: number): EventRow[] {
  const where = id ? 'e.id = @id' : 'e.location_id = @locationId';
  return db()
    .prepare(
      `SELECT e.*, d.name AS device_name FROM events e LEFT JOIN devices d ON d.id = e.device_id
       WHERE ${where} ORDER BY e.id DESC LIMIT @limit`,
    )
    .all({ locationId, id, limit })
    .map(toEvent);
}

export function createAlert(
  locationId: number,
  a: { severity: 'warning' | 'critical'; title: string; message: string; eventId?: number },
): Alert {
  const { lastInsertRowid } = db()
    .prepare('INSERT INTO alerts (location_id, event_id, severity, title, message) VALUES (?, ?, ?, ?, ?)')
    .run(locationId, a.eventId ?? null, a.severity, a.title, a.message);
  return getAlert(Number(lastInsertRowid))!;
}

export function getAlert(id: number): Alert | undefined {
  const r = db().prepare('SELECT * FROM alerts WHERE id = ?').get(id);
  return r ? toAlert(r) : undefined;
}

export function listActiveAlerts(locationId: number): Alert[] {
  return db()
    .prepare("SELECT * FROM alerts WHERE location_id = ? AND status IN ('open','escalating') ORDER BY id DESC")
    .all(locationId)
    .map(toAlert);
}

export function acknowledgeAlert(id: number, by: string, channel = 'dashboard'): Alert | undefined {
  db()
    .prepare(
      `UPDATE alerts SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = datetime('now'), ack_channel = ?
       WHERE id = ? AND status IN ('open','escalating')`,
    )
    .run(by, channel, id);
  return getAlert(id);
}

export function resolveAllAlerts(locationId: number) {
  db()
    .prepare("UPDATE alerts SET status = 'resolved', resolved_at = datetime('now') WHERE location_id = ? AND status != 'resolved'")
    .run(locationId);
}

export function addTemperatureReading(deviceId: number, value: number, min: number, max: number) {
  db()
    .prepare('INSERT INTO temperature_readings (device_id, value_c, min_limit, max_limit, in_range) VALUES (?, ?, ?, ?, ?)')
    .run(deviceId, value, min, max, value >= min && value <= max ? 1 : 0);
}
