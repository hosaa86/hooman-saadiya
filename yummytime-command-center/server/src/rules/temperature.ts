import * as repo from '../db/repo.js';
import { bus } from '../events/bus.js';
import { broadcast } from '../ws.js';
import type { Device } from '../types.js';

/**
 * Tracks how long each sensor has been outside its limits.
 * Out of range ≥ warnAfterMin → deviation ("avvik") opened + temp_warning.
 * ≥ criticalAfterMin, or further than criticalMargin past the limit → temp_critical.
 * Back in range → deviation closed + temp_recovered.
 */

interface Track {
  since: number;
  level: 0 | 1 | 2;
  deviationId: number | null;
  peak: number;
  peakOver: number;
}

const tracks = new Map<number, Track>();

const limits = (d: Device) => ({
  min: Number(d.settings.min ?? 0),
  max: Number(d.settings.max ?? 4),
  criticalMargin: Number(d.settings.criticalMargin ?? 2),
  warnAfterMin: Number(d.settings.warnAfterMin ?? 15),
  criticalAfterMin: Number(d.settings.criticalAfterMin ?? 45),
});

const fmt = (v: number) => `${v.toFixed(1)} °C`;

/** Rebuild state from deviations still open in the DB (after a restart). */
export function restoreTemperatureTracking() {
  for (const d of repo.openDeviations()) {
    tracks.set(d.deviceId, {
      since: new Date(d.startedAt).getTime(),
      level: d.severity === 'critical' ? 2 : 1,
      deviationId: d.id,
      peak: d.peakValueC ?? 0,
      peakOver: 0,
    });
  }
}

/** Demo helper: pretend the current excursion started `minutes` ago. */
export function backdate(deviceId: number, minutes: number) {
  const t = tracks.get(deviceId);
  if (t) t.since = Date.now() - minutes * 60_000;
}

export function resetTracking(deviceId: number) {
  const t = tracks.get(deviceId);
  if (t?.deviationId) repo.closeDeviation(t.deviationId);
  tracks.delete(deviceId);
}

function emit(device: Device, type: 'temp_warning' | 'temp_critical' | 'temp_recovered', severity: 'info' | 'warning' | 'critical', message: string) {
  const event = repo.addEvent(device.locationId, { deviceId: device.id, type, severity, message });
  broadcast({ type: 'event', event });
  bus.emit({ type, device, eventId: event.id, detail: message });
}

export function checkTemperature(device: Device, now = Date.now()) {
  const v = device.lastValue;
  if (v == null || !device.online) return;
  const s = limits(device);
  const over = Math.max(s.min - v, v - s.max, 0);
  let t = tracks.get(device.id);

  if (over === 0) {
    if (t) {
      if (t.deviationId) repo.closeDeviation(t.deviationId);
      if (t.level > 0) emit(device, 'temp_recovered', 'info', `${device.name} back within limits: ${fmt(v)}`);
      tracks.delete(device.id);
    }
    return;
  }

  if (!t) {
    t = { since: now, level: 0, deviationId: null, peak: v, peakOver: over };
    tracks.set(device.id, t);
  }
  if (over > t.peakOver) {
    t.peak = v;
    t.peakOver = over;
    if (t.deviationId) repo.updateDeviationPeak(t.deviationId, v);
  }

  const minutes = (now - t.since) / 60_000;
  const want: 0 | 1 | 2 = over > s.criticalMargin || minutes >= s.criticalAfterMin ? 2 : minutes >= s.warnAfterMin ? 1 : 0;
  if (want <= t.level) return;

  const severity = want === 2 ? 'critical' : 'warning';
  if (!t.deviationId) t.deviationId = repo.openDeviation(device.id, new Date(t.since).toISOString(), t.peak, s.min, s.max, severity);
  else repo.setDeviationSeverity(t.deviationId, severity);
  t.level = want;

  const side = v > s.max ? `above max ${s.max} °C` : `below min ${s.min} °C`;
  const mins = Math.max(1, Math.round(minutes));
  emit(device, want === 2 ? 'temp_critical' : 'temp_warning', severity, `${device.name} ${fmt(v)} — ${side} for ${mins} min`);
}
