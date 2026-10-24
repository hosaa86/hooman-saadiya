import * as repo from '../db/repo.js';
import { bus, type DeviceEventType } from '../events/bus.js';
import { broadcast } from '../ws.js';
import { LOW_BATTERY, temperatureStatus, type SensorLimits } from '../status.js';
import { checkTemperature } from '../rules/temperature.js';
import type { Device, Severity, Status } from '../types.js';

/** A reading from any provider (Aqara, IMOU, mock). Omitted fields are unchanged. */
export interface Reading {
  online?: boolean;
  battery?: number | null;
  value?: number | null;
  /** smoke|clear, open|closed, vibration|still, connected|… */
  state?: string | null;
}

const RANK: Record<Status, number> = { ok: 0, offline: 1, warning: 2, critical: 3 };
const worst = (a: Status, b: Status) => (RANK[b] > RANK[a] ? b : a);

/** Door/vibration only count as alarms while the location is armed and the detector follows night mode. */
const guarding = (d: Device) => repo.getLocation().armed && d.settings.armedSchedule !== false;

export function computeStatus(d: Device): Status {
  if (!d.online) return 'offline';
  let s: Status = 'ok';
  if (d.kind === 'temperature' && d.lastValue != null) s = temperatureStatus(d.lastValue, d.settings as unknown as SensorLimits);
  if (d.kind === 'smoke' && d.lastState === 'smoke') s = 'critical';
  if ((d.kind === 'door' && d.lastState === 'open') || (d.kind === 'vibration' && d.lastState === 'vibration')) s = guarding(d) ? 'critical' : 'ok';
  if (d.battery != null && d.battery < LOW_BATTERY) s = worst(s, 'warning');
  return s;
}

const loggedAt = new Map<number, number>();
const vibrationTimers = new Map<number, NodeJS.Timeout>();

/**
 * Apply a reading: update the device, broadcast it, log temperatures at the sensor's interval,
 * and emit device events on state changes. `baseline` (first read after start) updates without events.
 */
export function applyReading(device: Device, r: Reading, opts: { baseline?: boolean } = {}): Device {
  const events: { type: DeviceEventType; severity: Severity; message: string }[] = [];
  const n = device.name;
  const next: Device = { ...device };

  if (r.online !== undefined && r.online !== device.online) {
    next.online = r.online;
    events.push(r.online ? { type: 'online', severity: 'info', message: `${n} is back online` } : { type: 'offline', severity: 'warning', message: `${n} went offline` });
  }
  if (r.battery != null) {
    if (r.battery < LOW_BATTERY && (device.battery ?? 100) >= LOW_BATTERY)
      events.push({ type: 'low_battery', severity: 'warning', message: `${n} battery low (${r.battery}%)` });
    next.battery = r.battery;
  }
  if (r.value != null) next.lastValue = r.value;
  if (r.state != null && r.state !== device.lastState) {
    next.lastState = r.state;
    const armed = guarding(device);
    if (device.kind === 'smoke' && r.state === 'smoke') events.push({ type: 'smoke', severity: 'critical', message: `${n} reports smoke` });
    if (device.kind === 'smoke' && r.state === 'clear' && device.lastState === 'smoke') events.push({ type: 'smoke_clear', severity: 'info', message: `${n}: smoke cleared` });
    if (device.kind === 'door' && r.state === 'open') events.push({ type: 'door_open', severity: armed ? 'critical' : 'info', message: `${n} opened${armed ? ' while armed' : ''}` });
    if (device.kind === 'door' && r.state === 'closed' && device.lastState === 'open') events.push({ type: 'door_closed', severity: 'info', message: `${n} closed` });
    if (device.kind === 'vibration' && r.state === 'vibration') events.push({ type: 'vibration', severity: armed ? 'critical' : 'info', message: `Vibration at ${n}${armed ? ' while armed' : ''}` });
  }
  next.status = computeStatus(next);

  const saved = repo.updateDeviceState(device.id, {
    online: next.online,
    battery: next.battery,
    lastValue: next.lastValue,
    lastState: next.lastState,
    status: next.status,
  });
  broadcast({ type: 'device_update', device: saved });

  if (saved.kind === 'temperature' && saved.online && saved.lastValue != null) {
    const s = saved.settings as unknown as SensorLimits & { logIntervalMin: number };
    if (!loggedAt.has(saved.id)) loggedAt.set(saved.id, repo.lastReadingAt(saved.id));
    if (Date.now() - loggedAt.get(saved.id)! >= Number(s.logIntervalMin ?? 15) * 60_000) {
      repo.addTemperatureReading(saved.id, saved.lastValue, s.min, s.max);
      loggedAt.set(saved.id, Date.now());
    }
    checkTemperature(saved);
  }

  // A vibration is a moment, not a state: fall back to "still" after 30 s
  if (saved.kind === 'vibration' && saved.lastState === 'vibration') {
    clearTimeout(vibrationTimers.get(saved.id));
    vibrationTimers.set(
      saved.id,
      setTimeout(() => {
        const d = repo.getDevice(saved.id);
        if (d?.lastState === 'vibration') applyReading(d, { state: 'still' });
      }, 30_000),
    );
  }

  if (!opts.baseline) {
    for (const e of events) {
      const event = repo.addEvent(saved.locationId, { deviceId: saved.id, type: e.type, severity: e.severity, message: e.message });
      broadcast({ type: 'event', event });
      bus.emit({ type: e.type, device: saved, eventId: event.id, detail: e.message });
    }
  }
  return saved;
}

/** Re-evaluate door/vibration status after arming or disarming. */
export function refreshArmedStatus(locationId: number) {
  for (const d of repo.listDevices(locationId).filter((x) => x.kind === 'door' || x.kind === 'vibration')) {
    const status = computeStatus(d);
    if (status !== d.status) broadcast({ type: 'device_update', device: repo.updateDeviceState(d.id, { status, online: d.online }) });
  }
}
