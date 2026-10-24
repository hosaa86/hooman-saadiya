import { getDb } from './index.js';
import { config } from '../config.js';
import type { Alert, Category, Contact, Device, EventRow, Location, Notification, Recording, Rule, Severity } from '../types.js';
import { defaultFields, defaultMockState, defaultSettings } from '../devices/defaults.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => getDb();

// SQLite stores UTC as 'YYYY-MM-DD HH:MM:SS'; expose ISO with Z so browsers parse it as UTC.
const iso = (s: string | null) => (s ? s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z') : null);

const SNAPSHOT_AT = '(SELECT MAX(taken_at) FROM snapshots s WHERE s.device_id = devices.id) AS snapshot_at';

const toDevice = (r: any): Device => ({
  id: r.id,
  locationId: r.location_id,
  category: r.category,
  kind: r.kind,
  provider: r.provider,
  externalId: r.external_id,
  channelId: r.channel_id,
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
  snapshotAt: iso(r.snapshot_at ?? null),
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
  ackChannel: r.ack_channel,
  createdAt: iso(r.created_at)!,
  deviceId: r.device_id ?? null,
  dedupeKey: r.dedupe_key ?? null,
  escalationStep: r.escalation_step,
  lastNotification: r.last_notification ?? null,
  resolvedAt: iso(r.resolved_at),
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
    .prepare(`SELECT *, ${SNAPSHOT_AT} FROM devices WHERE location_id = ? AND archived_at IS NULL ORDER BY category, sort_order, id`)
    .all(locationId)
    .map(toDevice);
}

export function getDevice(id: number): Device | undefined {
  const r = db().prepare(`SELECT *, ${SNAPSHOT_AT} FROM devices WHERE id = ?`).get(id);
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
  a: { severity: 'warning' | 'critical'; title: string; message: string; eventId?: number; ruleId?: number; deviceId?: number; dedupeKey?: string },
): Alert {
  const { lastInsertRowid } = db()
    .prepare('INSERT INTO alerts (location_id, event_id, rule_id, device_id, dedupe_key, severity, title, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(locationId, a.eventId ?? null, a.ruleId ?? null, a.deviceId ?? null, a.dedupeKey ?? null, a.severity, a.title, a.message);
  return getAlert(Number(lastInsertRowid))!;
}

export function findActiveAlert(dedupeKey: string): Alert | undefined {
  const r = db().prepare("SELECT * FROM alerts WHERE dedupe_key = ? AND status IN ('open','escalating') ORDER BY id DESC LIMIT 1").get(dedupeKey);
  return r ? toAlert(r) : undefined;
}

export function upgradeAlert(id: number, severity: 'warning' | 'critical', title: string, message: string): Alert {
  db().prepare('UPDATE alerts SET severity = ?, title = ?, message = ? WHERE id = ?').run(severity, title, message, id);
  return getAlert(id)!;
}

export function setAlertEscalation(id: number, step: number, status: 'open' | 'escalating', lastNotification: string | null): Alert {
  db().prepare("UPDATE alerts SET escalation_step = ?, status = ?, last_notification = ? WHERE id = ? AND status IN ('open','escalating')").run(step, status, lastNotification, id);
  return getAlert(id)!;
}

export function resolveAlert(id: number): Alert {
  db().prepare("UPDATE alerts SET status = 'resolved', resolved_at = datetime('now') WHERE id = ? AND status IN ('open','escalating')").run(id);
  return getAlert(id)!;
}

export function listAlerts(locationId: number, limit = 100): Alert[] {
  return db().prepare('SELECT * FROM alerts WHERE location_id = ? ORDER BY id DESC LIMIT ?').all(locationId, limit).map(toAlert);
}

export function escalatingAlerts(): Alert[] {
  return db().prepare("SELECT * FROM alerts WHERE status = 'escalating'").all().map(toAlert);
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

// ---------------------------------------------------------------------------
// Device editing (settings screen)
// ---------------------------------------------------------------------------

export function createDevice(
  locationId: number,
  d: { category: Category; kind: string; name: string; provider?: string; externalId?: string | null; channelId?: string },
): Device {
  const provider = d.provider ?? 'mock';
  const settings = defaultSettings(d.kind);
  const state = defaultMockState(d.kind);
  const { m } = db().prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS m FROM devices WHERE location_id = ? AND category = ?').get(locationId, d.category) as { m: number };
  const { lastInsertRowid } = db()
    .prepare(
      `INSERT INTO devices (location_id, category, kind, provider, external_id, channel_id, name, sort_order,
         visible_fields, settings, status, online, battery, last_value, last_state, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(
      locationId, d.category, d.kind, provider, d.externalId || `${provider}-${Date.now()}`, d.channelId ?? '0', d.name, m,
      JSON.stringify(defaultFields(d.category)), JSON.stringify(settings),
      provider === 'mock' ? state.status : 'offline', provider === 'mock' ? state.online : 0,
      state.battery, state.last_value, state.last_state,
    );
  return getDevice(Number(lastInsertRowid))!;
}

export function updateDevice(
  id: number,
  patch: { name?: string; visibleFields?: string[]; settings?: Record<string, unknown> },
): Device {
  const cols: Record<string, unknown> = { id };
  const sets: string[] = ["updated_at = datetime('now')"];
  if (patch.name !== undefined) (cols.name = patch.name), sets.push('name = @name');
  if (patch.visibleFields !== undefined) (cols.vf = JSON.stringify(patch.visibleFields)), sets.push('visible_fields = @vf');
  if (patch.settings !== undefined) (cols.settings = JSON.stringify(patch.settings)), sets.push('settings = @settings');
  db().prepare(`UPDATE devices SET ${sets.join(', ')} WHERE id = @id`).run(cols);
  return getDevice(id)!;
}

/** Hard-delete, unless the device has compliance logs — then archive so the logs stay intact. */
export function deleteDevice(id: number): 'deleted' | 'archived' {
  const { n } = db()
    .prepare('SELECT (SELECT COUNT(*) FROM temperature_readings WHERE device_id = @id) + (SELECT COUNT(*) FROM deviations WHERE device_id = @id) AS n')
    .get({ id }) as { n: number };
  if (n > 0) {
    db().prepare("UPDATE devices SET archived_at = datetime('now') WHERE id = ?").run(id);
    return 'archived';
  }
  db().prepare('DELETE FROM devices WHERE id = ?').run(id);
  return 'deleted';
}

export function reorderDevices(ids: number[]) {
  const stmt = db().prepare('UPDATE devices SET sort_order = ? WHERE id = ?');
  db().transaction(() => ids.forEach((id, i) => stmt.run(i, id)))();
}

export interface Schedule {
  enabled: boolean;
  days: number[];
  armTime: string;
  disarmTime: string;
}

export function getSchedule(locationId: number): Schedule {
  const r: any = db().prepare('SELECT * FROM arm_schedules WHERE location_id = ? ORDER BY id LIMIT 1').get(locationId);
  return { enabled: !!r.enabled, days: r.days.split(',').map(Number), armTime: r.arm_time, disarmTime: r.disarm_time };
}

export function setSchedule(locationId: number, s: Schedule): Schedule {
  db()
    .prepare('UPDATE arm_schedules SET enabled = ?, days = ?, arm_time = ?, disarm_time = ? WHERE location_id = ?')
    .run(s.enabled ? 1 : 0, s.days.join(','), s.armTime, s.disarmTime, locationId);
  return getSchedule(locationId);
}

// ---------------------------------------------------------------------------
// Cameras: recordings & snapshots
// ---------------------------------------------------------------------------

const toRecording = (r: any): Recording => ({
  id: r.id,
  deviceId: r.device_id,
  reason: r.reason,
  filePath: r.file_path,
  startedAt: iso(r.started_at)!,
  endedAt: iso(r.ended_at),
  sizeBytes: r.size_bytes,
});

export function findDeviceByExternal(provider: string, externalId: string, channelId: string): Device | undefined {
  const r = db()
    .prepare(`SELECT *, ${SNAPSHOT_AT} FROM devices WHERE provider = ? AND external_id = ? AND channel_id = ?`)
    .get(provider, externalId, channelId);
  return r ? toDevice(r) : undefined;
}

export function startRecordingRow(deviceId: number, reason: string, filePath: string | null, alertId?: number): number {
  return Number(
    db().prepare('INSERT INTO recordings (device_id, alert_id, reason, file_path) VALUES (?, ?, ?, ?)').run(deviceId, alertId ?? null, reason, filePath)
      .lastInsertRowid,
  );
}

export function endRecordingRow(id: number, sizeBytes: number | null) {
  db().prepare("UPDATE recordings SET ended_at = datetime('now'), size_bytes = ? WHERE id = ?").run(sizeBytes, id);
}

export function listRecordings(deviceId?: number, limit = 50): Recording[] {
  return db()
    .prepare(`SELECT * FROM recordings WHERE file_path IS NOT NULL ${deviceId ? 'AND device_id = @deviceId' : ''} ORDER BY id DESC LIMIT @limit`)
    .all({ deviceId, limit })
    .map(toRecording);
}

export function getRecording(id: number): Recording | undefined {
  const r = db().prepare('SELECT * FROM recordings WHERE id = ?').get(id);
  return r ? toRecording(r) : undefined;
}

export function addSnapshot(deviceId: number, filePath: string) {
  db().prepare('INSERT INTO snapshots (device_id, file_path) VALUES (?, ?)').run(deviceId, filePath);
}

export function latestSnapshot(deviceId: number): string | undefined {
  const r = db().prepare('SELECT file_path FROM snapshots WHERE device_id = ? ORDER BY id DESC LIMIT 1').get(deviceId) as { file_path: string } | undefined;
  return r?.file_path;
}

/** Rows older than `days` (finished recordings + snapshots) — caller deletes the files. */
export function expiredMedia(days: number): { recordings: { id: number; file_path: string | null }[]; snapshots: { id: number; file_path: string }[] } {
  const cutoff = `-${days} days`;
  return {
    recordings: db().prepare("SELECT id, file_path FROM recordings WHERE ended_at IS NOT NULL AND started_at < datetime('now', ?)").all(cutoff) as any,
    snapshots: db().prepare("SELECT id, file_path FROM snapshots WHERE taken_at < datetime('now', ?)").all(cutoff) as any,
  };
}

export function deleteMediaRows(recordingIds: number[], snapshotIds: number[]) {
  const r = db().prepare('DELETE FROM recordings WHERE id = ?');
  const s = db().prepare('DELETE FROM snapshots WHERE id = ?');
  db().transaction(() => {
    recordingIds.forEach((id) => r.run(id));
    snapshotIds.forEach((id) => s.run(id));
  })();
}

// ---------------------------------------------------------------------------
// Key/value settings
// ---------------------------------------------------------------------------

export function getSetting(key: string): string | null {
  const r = db().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return r?.value ?? null;
}

export function setSetting(key: string, value: string | null) {
  if (value === null) db().prepare('DELETE FROM app_settings WHERE key = ?').run(key);
  else db().prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export function lastReadingAt(deviceId: number): number {
  const r = db().prepare('SELECT MAX(recorded_at) AS t FROM temperature_readings WHERE device_id = ?').get(deviceId) as { t: string | null };
  return r.t ? new Date(iso(r.t)!).getTime() : 0;
}

// ---------------------------------------------------------------------------
// Deviations ("avvik")
// ---------------------------------------------------------------------------

export interface Deviation {
  id: number;
  deviceId: number;
  deviceName: string | null;
  startedAt: string;
  endedAt: string | null;
  peakValueC: number | null;
  minLimit: number | null;
  maxLimit: number | null;
  severity: 'warning' | 'critical';
  correctiveAction: string | null;
  signedBy: string | null;
  signedAt: string | null;
}

const toDeviation = (r: any): Deviation => ({
  id: r.id,
  deviceId: r.device_id,
  deviceName: r.device_name ?? null,
  startedAt: iso(r.started_at)!,
  endedAt: iso(r.ended_at),
  peakValueC: r.peak_value_c,
  minLimit: r.min_limit,
  maxLimit: r.max_limit,
  severity: r.severity,
  correctiveAction: r.corrective_action,
  signedBy: r.signed_by,
  signedAt: iso(r.signed_at),
});

/** `startedAt` is an ISO timestamp; stored in SQLite's UTC format like every other column. */
export function openDeviation(deviceId: number, startedAt: string, peak: number, min: number, max: number, severity: string): number {
  return Number(
    db()
      .prepare("INSERT INTO deviations (device_id, started_at, peak_value_c, min_limit, max_limit, severity) VALUES (?, datetime(?), ?, ?, ?, ?)")
      .run(deviceId, startedAt, peak, min, max, severity).lastInsertRowid,
  );
}

export const updateDeviationPeak = (id: number, peak: number) => db().prepare('UPDATE deviations SET peak_value_c = ? WHERE id = ?').run(peak, id);
export const setDeviationSeverity = (id: number, severity: string) => db().prepare('UPDATE deviations SET severity = ? WHERE id = ?').run(severity, id);
export const closeDeviation = (id: number) => db().prepare("UPDATE deviations SET ended_at = datetime('now') WHERE id = ? AND ended_at IS NULL").run(id);

export function openDeviations(): Deviation[] {
  return db().prepare('SELECT * FROM deviations WHERE ended_at IS NULL').all().map(toDeviation);
}

export function listDeviations(opts: { deviceIds?: number[]; from?: string; to?: string; limit?: number } = {}): Deviation[] {
  const where: string[] = [];
  const params: Record<string, unknown> = { limit: opts.limit ?? 500 };
  if (opts.deviceIds?.length) where.push(`v.device_id IN (${opts.deviceIds.map(Number).join(',')})`);
  if (opts.from) (where.push('COALESCE(v.ended_at, datetime(\'now\')) >= @from'), (params.from = opts.from));
  if (opts.to) (where.push('v.started_at < @to'), (params.to = opts.to));
  return db()
    .prepare(
      `SELECT v.*, d.name AS device_name FROM deviations v JOIN devices d ON d.id = v.device_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY v.started_at DESC LIMIT @limit`,
    )
    .all(params)
    .map(toDeviation);
}

export function signDeviation(id: number, correctiveAction: string, signedBy: string): Deviation | undefined {
  db()
    .prepare("UPDATE deviations SET corrective_action = ?, signed_by = ?, signed_at = datetime('now') WHERE id = ?")
    .run(correctiveAction, signedBy, id);
  const r = db().prepare('SELECT v.*, d.name AS device_name FROM deviations v JOIN devices d ON d.id = v.device_id WHERE v.id = ?').get(id);
  return r ? toDeviation(r) : undefined;
}

// ---------------------------------------------------------------------------
// Contacts, notifications, rules
// ---------------------------------------------------------------------------

const toContact = (r: any): Contact => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  whatsapp: r.whatsapp,
  escalationOrder: r.escalation_order,
  waitMinutes: r.wait_minutes,
  receiveWarnings: !!r.receive_warnings,
  enabled: !!r.enabled,
});

export function listContacts(locationId: number, onlyEnabled = false): Contact[] {
  return db()
    .prepare(`SELECT * FROM contacts WHERE location_id = ? ${onlyEnabled ? 'AND enabled = 1' : ''} ORDER BY escalation_order, id`)
    .all(locationId)
    .map(toContact);
}

export function getContact(id: number): Contact | undefined {
  const r = db().prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  return r ? toContact(r) : undefined;
}

export function saveContact(locationId: number, c: Omit<Contact, 'id'> & { id?: number }): Contact {
  const p = {
    locationId,
    name: c.name,
    phone: c.phone,
    whatsapp: c.whatsapp || null,
    order: c.escalationOrder,
    wait: c.waitMinutes,
    warn: c.receiveWarnings ? 1 : 0,
    enabled: c.enabled ? 1 : 0,
  };
  if (c.id) {
    db()
      .prepare('UPDATE contacts SET name=@name, phone=@phone, whatsapp=@whatsapp, escalation_order=@order, wait_minutes=@wait, receive_warnings=@warn, enabled=@enabled WHERE id=@id')
      .run({ ...p, id: c.id });
    return getContact(c.id)!;
  }
  const { lastInsertRowid } = db()
    .prepare('INSERT INTO contacts (location_id, name, phone, whatsapp, escalation_order, wait_minutes, receive_warnings, enabled) VALUES (@locationId, @name, @phone, @whatsapp, @order, @wait, @warn, @enabled)')
    .run(p);
  return getContact(Number(lastInsertRowid))!;
}

export const deleteContact = (id: number) => db().prepare('DELETE FROM contacts WHERE id = ?').run(id);

export function findContactByNumber(locationId: number, number: string): Contact | undefined {
  const digits = (s: string | null) => (s ?? '').replace(/[^0-9]/g, '');
  const n = digits(number);
  return listContacts(locationId).find((c) => digits(c.phone) === n || digits(c.whatsapp) === n);
}

const toNotification = (r: any): Notification => ({
  id: r.id,
  alertId: r.alert_id,
  contactName: r.contact_name ?? null,
  channel: r.channel,
  toNumber: r.to_number,
  providerSid: r.provider_sid,
  status: r.status,
  error: r.error,
  createdAt: iso(r.created_at)!,
});

export function addNotification(n: { alertId: number; contactId?: number; channel: string; to: string; sid: string | null; status: string; error?: string | null }): number {
  return Number(
    db()
      .prepare('INSERT INTO alert_notifications (alert_id, contact_id, channel, to_number, provider_sid, status, error) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(n.alertId, n.contactId ?? null, n.channel, n.to, n.sid, n.status, n.error ?? null).lastInsertRowid,
  );
}

export function updateNotificationStatus(id: number, status: string, error?: string | null) {
  db().prepare("UPDATE alert_notifications SET status = ?, error = COALESCE(?, error), updated_at = datetime('now') WHERE id = ?").run(status, error ?? null, id);
}

export function listNotifications(alertIds: number[]): Notification[] {
  if (alertIds.length === 0) return [];
  return db()
    .prepare(
      `SELECT n.*, c.name AS contact_name FROM alert_notifications n LEFT JOIN contacts c ON c.id = n.contact_id
       WHERE n.alert_id IN (${alertIds.map(Number).join(',')}) ORDER BY n.id`,
    )
    .all()
    .map(toNotification);
}

function toRule(r: any): Rule {
  const trigger = JSON.parse(r.trigger);
  const conditions: any[] = JSON.parse(r.conditions);
  const actions: any[] = JSON.parse(r.actions);
  const alert = actions.find((a) => a.type === 'alert');
  return {
    id: r.id,
    name: r.name,
    enabled: !!r.enabled,
    events: ([] as string[]).concat(trigger.event ?? []),
    armedOnly: conditions.some((c) => c.armed === true),
    recordCameras: actions.some((a) => a.type === 'record_all'),
    openLiveView: actions.some((a) => a.type === 'open_live_view'),
    alertSeverity: alert?.severity ?? 'none',
    escalateToCritical: actions.some((a) => a.type === 'escalate'),
    sortOrder: r.sort_order,
  };
}

export function listRules(locationId: number): Rule[] {
  return db().prepare('SELECT * FROM rules WHERE location_id = ? ORDER BY sort_order, id').all(locationId).map(toRule);
}

export function saveRule(locationId: number, r: Omit<Rule, 'id' | 'sortOrder'> & { id?: number }): Rule {
  const trigger = JSON.stringify({ event: r.events });
  const conditions = JSON.stringify(r.armedOnly ? [{ armed: true }] : []);
  const actions = JSON.stringify([
    ...(r.recordCameras ? [{ type: 'record_all' }] : []),
    ...(r.openLiveView ? [{ type: 'open_live_view' }] : []),
    ...(r.alertSeverity !== 'none' ? [{ type: 'alert', severity: r.alertSeverity }] : []),
    ...(r.escalateToCritical ? [{ type: 'escalate', severity: 'critical' }] : []),
  ]);
  if (r.id) {
    db()
      .prepare("UPDATE rules SET name = ?, enabled = ?, trigger = ?, conditions = ?, actions = ?, updated_at = datetime('now') WHERE id = ?")
      .run(r.name, r.enabled ? 1 : 0, trigger, conditions, actions, r.id);
    return toRule(db().prepare('SELECT * FROM rules WHERE id = ?').get(r.id));
  }
  const { m } = db().prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS m FROM rules WHERE location_id = ?').get(locationId) as { m: number };
  const { lastInsertRowid } = db()
    .prepare('INSERT INTO rules (location_id, name, enabled, trigger, conditions, actions, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(locationId, r.name, r.enabled ? 1 : 0, trigger, conditions, actions, m);
  return toRule(db().prepare('SELECT * FROM rules WHERE id = ?').get(Number(lastInsertRowid)));
}

export const deleteRule = (id: number) => db().prepare('DELETE FROM rules WHERE id = ?').run(id);
