/**
 * In-browser stand-in for the backend, used by the shareable demo build (VITE_DEMO=1).
 * Same routes and WebSocket messages as the real server, with simulated mock devices.
 */
import type { Alert, Category, Device, EventRow, Location, Schedule, ServerMessage } from '../types';

const FIELD_OPTIONS: Record<Category, Record<string, string>> = {
  camera: { live: 'Live thumbnail', rec: 'REC badge', status: 'Status dot' },
  sensor: { value: 'Value + trend', limits: 'Limits', battery: 'Battery', lastSeen: 'Last update' },
  detector: { state: 'State', armed: 'Armed state', battery: 'Battery' },
  hub: { connection: 'Connection', linked: 'Linked devices' },
};
const KINDS: Record<Category, string[]> = { camera: ['camera'], sensor: ['temperature'], detector: ['smoke', 'door', 'vibration'], hub: ['hub'] };

const now = () => new Date().toISOString();
let nextId = 1;
const listeners = new Set<(m: ServerMessage) => void>();
const emit = (m: ServerMessage) => listeners.forEach((l) => l(m));

function dev(category: Category, kind: string, name: string, settings: Record<string, any>, state: Partial<Device>): Device {
  return {
    id: nextId++, category, kind, provider: 'mock', externalId: null, channelId: '0', name, sortOrder: nextId,
    visibleFields: Object.keys(FIELD_OPTIONS[category]), settings, status: 'ok', online: true, battery: null,
    lastValue: null, lastState: null, lastSeen: now(), snapshotAt: null, ...state,
  };
}
const temp = (min: number, max: number, mean: number) => ({ logIntervalMin: 15, min, max, criticalMargin: 2, warnAfterMin: 15, criticalAfterMin: 45, mockMean: mean });

const devices: Device[] = [
  dev('camera', 'camera', 'Inngang', { recordingMode: 'on_event', clipSeconds: 60 }, { lastState: 'idle' }),
  dev('camera', 'camera', 'Kasse', { recordingMode: 'on_event', clipSeconds: 60 }, { lastState: 'idle' }),
  dev('camera', 'camera', 'Kjøkken', { recordingMode: 'continuous', clipSeconds: 300 }, { lastState: 'recording' }),
  dev('camera', 'camera', 'Spisesal', { recordingMode: 'on_event', clipSeconds: 60 }, { lastState: 'idle' }),
  dev('camera', 'camera', 'Bakgård', { recordingMode: 'on_event', clipSeconds: 60 }, { online: false, status: 'offline', lastState: 'idle' }),
  dev('sensor', 'temperature', 'Kjøleskap 1', temp(0, 4, 3.1), { lastValue: 3.1, battery: 88 }),
  dev('sensor', 'temperature', 'Kjøleskap 2', temp(0, 4, 4.7), { lastValue: 4.7, battery: 74, status: 'warning' }),
  dev('sensor', 'temperature', 'Fryser', { ...temp(-25, -18, -20.5), criticalMargin: 3 }, { lastValue: -20.5, battery: 91 }),
  dev('sensor', 'temperature', 'Kjølerom', temp(0, 4, 2.4), { lastValue: 2.4, battery: 65 }),
  dev('detector', 'smoke', 'Røykvarsler Kjøkken', { armedSchedule: false, sensitivity: 'high' }, { lastState: 'clear', battery: 95 }),
  dev('detector', 'smoke', 'Røykvarsler Spisesal', { armedSchedule: false, sensitivity: 'medium' }, { lastState: 'clear', battery: 90 }),
  dev('detector', 'door', 'Hovedinngang', { armedSchedule: true, sensitivity: 'medium' }, { lastState: 'closed', battery: 12, status: 'warning' }),
  dev('detector', 'door', 'Bakdør', { armedSchedule: true, sensitivity: 'medium' }, { lastState: 'closed', battery: 80 }),
  dev('detector', 'vibration', 'Vibrasjon Kasse', { armedSchedule: true, sensitivity: 'medium' }, { lastState: 'still', battery: 77 }),
  dev('hub', 'hub', 'Aqara Hub M3', {}, { lastState: 'connected', lastValue: 9 }),
];
devices.forEach((d, i) => (d.sortOrder = i));

const location: Location = { id: 1, name: 'Yummy Time Capsule', armed: false, armedBy: null, armedAt: null };
let schedule: Schedule = { enabled: true, days: [1, 2, 3, 4, 5, 6, 7], armTime: '23:00', disarmTime: '06:00' };
const events: EventRow[] = [];
let alerts: Alert[] = [];
let eventId = 1;
let alertId = 1;

function addEvent(e: { device?: Device; type: string; severity: EventRow['severity']; message: string }) {
  const ev: EventRow = { id: eventId++, deviceId: e.device?.id ?? null, deviceName: e.device?.name ?? null, type: e.type, severity: e.severity, message: e.message, createdAt: now() };
  events.unshift(ev);
  emit({ type: 'event', event: ev });
  return ev;
}
function addAlert(severity: Alert['severity'], title: string, message: string) {
  const a: Alert = {
    id: alertId++, severity, title, message, status: 'open', acknowledgedBy: null, acknowledgedAt: null, ackChannel: null,
    createdAt: now(), deviceId: null, escalationStep: 0, lastNotification: severity === 'critical' ? 'Calling Hooman (1/4) — demo, nobody is called' : null, resolvedAt: null,
  };
  alerts.unshift(a);
  emit({ type: 'alert', alert: a });
}
function update(d: Device, patch: Partial<Device>) {
  Object.assign(d, patch, { lastSeen: now() });
  emit({ type: 'device_update', device: { ...d } });
}
const tempStatus = (v: number, s: any): Device['status'] => {
  const over = Math.max(s.min - v, v - s.max, 0);
  return over === 0 ? 'ok' : over > s.criticalMargin ? 'critical' : 'warning';
};
const find = (kind: string) => devices.find((d) => d.kind === kind)!;
const cameras = () => devices.filter((d) => d.category === 'camera' && d.online);

[
  ['system', 'info', 'Demo started — simulated devices'],
  ['offline', 'warning', 'Bakgård camera went offline'],
  ['low_battery', 'warning', 'Hovedinngang door sensor battery low (12%)'],
  ['temp_out_of_range', 'warning', 'Kjøleskap 2 above limit: 4.7 °C (max 4 °C)'],
].forEach(([type, severity, message]) => addEvent({ type, severity: severity as any, message }));

setInterval(() => {
  for (const d of devices) {
    if (d.kind !== 'temperature' || !d.online || d.lastState === 'forced') continue;
    const s = d.settings;
    const prev = d.lastValue ?? s.mockMean;
    const next = Math.round((prev + (s.mockMean - prev) * 0.3 + (Math.random() - 0.5) * 0.3) * 10) / 10;
    update(d, { lastValue: next, status: tempStatus(next, s) });
  }
}, 4000);

function critical(d: Device, type: string, title: string, message: string) {
  addEvent({ device: d, type, severity: 'critical', message });
  const cams = cameras().filter((c) => c.settings.recordingMode !== 'off');
  cams.forEach((c) => update(c, { lastState: 'recording' }));
  addEvent({ type: 'recording', severity: 'info', message: `Recording started on ${cams.length} cameras` });
  addAlert('critical', title, message);
  emit({ type: 'open_live_view', deviceIds: cameras().map((c) => c.id) });
}

function scenario(name: string) {
  if (name === 'smoke') {
    const d = find('smoke');
    update(d, { lastState: 'smoke', status: 'critical' });
    critical(d, 'smoke', `Smoke detected – ${d.name}`, `${d.name} reports smoke at ${location.name}.`);
  } else if (name === 'intrusion') {
    if (!location.armed) setArmed(true, 'demo');
    const d = find('door');
    update(d, { lastState: 'open', status: 'critical' });
    critical(d, 'door_open', `Intrusion – ${d.name} opened`, `${d.name} opened while armed at ${location.name}.`);
  } else if (name === 'temperature') {
    const d = find('temperature');
    const v = d.settings.max + d.settings.criticalMargin + 1.5;
    update(d, { lastValue: v, lastState: 'forced', status: tempStatus(v, d.settings) });
    const message = `${d.name} at ${v.toFixed(1)} °C (max ${d.settings.max} °C)`;
    addEvent({ device: d, type: 'temp_out_of_range', severity: 'warning', message });
    addAlert('warning', `Temperature high – ${d.name}`, message);
  } else if (name === 'reset') {
    alerts = [];
    for (const d of devices) {
      if (d.kind === 'smoke' && d.lastState !== 'clear') update(d, { lastState: 'clear', status: 'ok' });
      if (d.kind === 'door' && d.lastState === 'open') update(d, { lastState: 'closed', status: (d.battery ?? 100) < 20 ? 'warning' : 'ok' });
      if (d.kind === 'temperature' && d.lastState === 'forced') update(d, { lastState: null });
      if (d.category === 'camera' && d.lastState === 'recording' && d.settings.recordingMode !== 'continuous') update(d, { lastState: 'idle' });
    }
    emit({ type: 'alerts_cleared' });
    addEvent({ type: 'system', severity: 'info', message: 'Demo reset – all clear' });
  }
}

function setArmed(armed: boolean, by: string) {
  Object.assign(location, { armed, armedBy: by, armedAt: now() });
  emit({ type: 'location', location: { ...location } });
  addEvent({ type: armed ? 'armed' : 'disarmed', severity: 'info', message: `${armed ? 'Armed' : 'Disarmed'} by ${by}` });
}

class DemoError extends Error {}
const fail = (msg: string): never => {
  throw new DemoError(msg);
};

/** Handle an API call the way the real server would. */
export async function handle(method: string, path: string, body: any): Promise<any> {
  await new Promise((r) => setTimeout(r, 80));
  const m = (re: RegExp) => path.match(re);
  let r: RegExpMatchArray | null;

  if (method === 'GET' && path === '/dashboard')
    return { location: { ...location }, mockMode: true, devices: devices.map((d) => ({ ...d })), events: events.slice(0, 50), alerts: [...alerts] };
  if (method === 'POST' && path === '/location/arm') return setArmed(!!body.armed, body.by ?? 'Hooman'), { ...location };
  if (method === 'POST' && (r = m(/^\/alerts\/(\d+)\/ack$/))) {
    const a = alerts.find((x) => x.id === Number(r![1])) ?? fail('Alert not found');
    Object.assign(a, { status: 'acknowledged', acknowledgedBy: body.by ?? 'Hooman', acknowledgedAt: now() });
    alerts = alerts.filter((x) => x !== a);
    emit({ type: 'alert', alert: { ...a } });
    addEvent({ type: 'acknowledged', severity: 'info', message: `"${a.title}" acknowledged by ${a.acknowledgedBy}` });
    return a;
  }
  if (method === 'POST' && (r = m(/^\/mock\/scenario\/(\w+)$/))) return scenario(r[1]), { ok: true };
  if (method === 'GET' && path === '/devices/meta') return { fieldOptions: FIELD_OPTIONS, kinds: KINDS };
  if (method === 'POST' && path === '/devices') {
    if (!String(body.name ?? '').trim()) fail('Name is required');
    const defaults: Record<string, [any, Partial<Device>]> = {
      camera: [{ recordingMode: 'on_event', clipSeconds: 60 }, { lastState: 'idle' }],
      temperature: [temp(0, 4, 2), { lastValue: 2, battery: 100 }],
      smoke: [{ armedSchedule: false, sensitivity: 'high' }, { lastState: 'clear', battery: 100 }],
      door: [{ armedSchedule: true, sensitivity: 'medium' }, { lastState: 'closed', battery: 100 }],
      vibration: [{ armedSchedule: true, sensitivity: 'medium' }, { lastState: 'still', battery: 100 }],
    };
    const [settings, state] = defaults[body.kind] ?? [{}, {}];
    const d = dev(body.category, body.kind, body.name.trim(), settings, state);
    d.sortOrder = Math.max(-1, ...devices.filter((x) => x.category === body.category).map((x) => x.sortOrder)) + 1;
    devices.push(d);
    emit({ type: 'devices_changed' });
    addEvent({ type: 'system', severity: 'info', message: `Device added: ${d.name}` });
    return d;
  }
  if (method === 'PUT' && path === '/devices/order') {
    (body.ids as number[]).forEach((id, i) => {
      const d = devices.find((x) => x.id === id);
      if (d) d.sortOrder = i;
    });
    emit({ type: 'devices_changed' });
    return { ok: true };
  }
  if ((r = m(/^\/devices\/(\d+)(\/test)?$/))) {
    const d = devices.find((x) => x.id === Number(r![1])) ?? fail('Device not found');
    if (method === 'DELETE') {
      devices.splice(devices.indexOf(d), 1);
      emit({ type: 'devices_changed' });
      addEvent({ type: 'system', severity: 'info', message: `Device removed: ${d.name}` });
      return { result: d.kind === 'temperature' ? 'archived' : 'deleted' };
    }
    if (method === 'POST' && r[2]) {
      const alarm = ({ smoke: 'smoke', door: 'open', vibration: 'vibration' } as Record<string, string>)[d.kind];
      emit({ type: 'device_update', device: { ...d, lastState: alarm, status: 'warning' } });
      addEvent({ device: d, type: 'test', severity: 'info', message: `Test: ${d.name} triggered (no alert sent)` });
      setTimeout(() => emit({ type: 'device_update', device: { ...d } }), 4000);
      return { ok: true };
    }
    if (method === 'PATCH') {
      const s = { ...d.settings, ...(body.settings ?? {}) };
      if (d.kind === 'temperature') {
        if (![s.min, s.max, s.logIntervalMin, s.criticalMargin, s.warnAfterMin, s.criticalAfterMin].every(Number.isFinite)) fail('Fill in all numbers');
        if (s.min >= s.max) fail('Min limit must be lower than max limit');
        if (s.criticalAfterMin < s.warnAfterMin) fail('Critical delay must be longer than warning delay');
      }
      if (d.category === 'camera' && !(s.clipSeconds >= 5 && s.clipSeconds <= 3600)) fail('Clip length must be 5–3600 seconds');
      if (body.name !== undefined && !String(body.name).trim()) fail('Name is required');
      update(d, {
        name: body.name?.trim() ?? d.name,
        visibleFields: body.visibleFields ?? d.visibleFields,
        settings: s,
        ...(d.kind === 'temperature' && d.lastValue != null ? { status: tempStatus(d.lastValue, s) } : {}),
        ...(d.category === 'camera' && d.online ? { lastState: s.recordingMode === 'continuous' ? 'recording' : 'idle' } : {}),
      });
      return { ...d };
    }
  }
  if (path === '/location/schedule') {
    if (method === 'PUT') {
      schedule = { ...body, days: [...new Set(body.days as number[])].sort() };
      addEvent({ type: 'system', severity: 'info', message: schedule.enabled ? `Night mode schedule: arm ${schedule.armTime}, disarm ${schedule.disarmTime}` : 'Night mode schedule turned off' });
    }
    return { ...schedule };
  }
  if ((r = m(/^\/cameras\/(\d+)\/record(\/stop)?$/))) {
    const d = devices.find((x) => x.id === Number(r![1])) ?? fail('Camera not found');
    update(d, { lastState: r[2] ? 'idle' : 'recording' });
    if (!r[2]) setTimeout(() => d.lastState === 'recording' && d.settings.recordingMode !== 'continuous' && update(d, { lastState: 'idle' }), (d.settings.clipSeconds ?? 60) * 1000);
    return { recording: !r[2] };
  }
  if (path.startsWith('/cameras/recordings')) return [];
  fail('Not available in the demo — needs the local server and real devices');
}

export function subscribe(fn: (m: ServerMessage) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
