import * as repo from '../db/repo.js';
import { broadcast } from '../ws.js';
import { temperatureStatus, type SensorLimits } from '../status.js';
import type { Device } from '../types.js';

/**
 * Mock alarm scenarios for reviewing the dashboard (step 2).
 * The rules engine (step 6) replaces the hard-coded reactions below.
 */
export type Scenario = 'smoke' | 'intrusion' | 'temperature' | 'reset';

function push(d: Device) {
  broadcast({ type: 'device_update', device: d });
}

function recordAllCameras(locationId: number) {
  const cams = repo.listDevices(locationId).filter((d) => d.category === 'camera' && d.online);
  cams.forEach((c) => push(repo.updateDeviceState(c.id, { lastState: 'recording' })));
  return cams.map((c) => c.id);
}

function critical(locationId: number, device: Device, type: string, title: string, message: string) {
  const event = repo.addEvent(locationId, { deviceId: device.id, type, severity: 'critical', message });
  broadcast({ type: 'event', event });
  const cameraIds = recordAllCameras(locationId);
  broadcast({
    type: 'event',
    event: repo.addEvent(locationId, { type: 'recording', severity: 'info', message: `Recording started on ${cameraIds.length} cameras` }),
  });
  const alert = repo.createAlert(locationId, { severity: 'critical', title, message, eventId: event.id });
  broadcast({ type: 'alert', alert });
  broadcast({ type: 'open_live_view', deviceIds: cameraIds });
  return alert;
}

export function runScenario(s: Scenario) {
  const loc = repo.getLocation();
  const devices = repo.listDevices(loc.id);
  const find = (kind: string) => devices.find((d) => d.kind === kind)!;

  switch (s) {
    case 'smoke': {
      const d = repo.updateDeviceState(find('smoke').id, { lastState: 'smoke', status: 'critical' });
      push(d);
      return critical(loc.id, d, 'smoke', `Smoke detected – ${d.name}`, `${d.name} reports smoke at ${loc.name}.`);
    }
    case 'intrusion': {
      if (!loc.armed) broadcast({ type: 'location', location: repo.setArmed(true, 'demo') });
      const d = repo.updateDeviceState(find('door').id, { lastState: 'open', status: 'critical' });
      push(d);
      return critical(loc.id, d, 'door_open', `Intrusion – ${d.name} opened`, `${d.name} opened while armed at ${loc.name}.`);
    }
    case 'temperature': {
      const sensor = find('temperature');
      const lim = sensor.settings as unknown as SensorLimits;
      const value = lim.max + lim.criticalMargin + 1.5;
      const d = repo.updateDeviceState(sensor.id, { lastValue: value, lastState: 'forced', status: temperatureStatus(value, lim) });
      push(d);
      const message = `${d.name} at ${value.toFixed(1)} °C (max ${lim.max} °C)`;
      const event = repo.addEvent(loc.id, { deviceId: d.id, type: 'temp_out_of_range', severity: 'warning', message });
      broadcast({ type: 'event', event });
      const alert = repo.createAlert(loc.id, { severity: 'warning', title: `Temperature high – ${d.name}`, message, eventId: event.id });
      broadcast({ type: 'alert', alert });
      return alert;
    }
    case 'reset': {
      repo.resolveAllAlerts(loc.id);
      for (const d of devices) {
        if (d.kind === 'smoke' && d.lastState !== 'clear') push(repo.updateDeviceState(d.id, { lastState: 'clear', status: 'ok' }));
        if (d.kind === 'door' && d.lastState === 'open')
          push(repo.updateDeviceState(d.id, { lastState: 'closed', status: (d.battery ?? 100) < 20 ? 'warning' : 'ok' }));
        if (d.kind === 'temperature' && d.lastState === 'forced') push(repo.updateDeviceState(d.id, { lastState: null }));
        if (d.category === 'camera' && d.lastState === 'recording' && (d.settings as { recordingMode?: string }).recordingMode !== 'continuous')
          push(repo.updateDeviceState(d.id, { lastState: 'idle' }));
      }
      broadcast({ type: 'alerts_cleared' });
      broadcast({ type: 'event', event: repo.addEvent(loc.id, { type: 'system', severity: 'info', message: 'Demo reset – all clear' }) });
      return null;
    }
  }
}
