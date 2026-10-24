import * as repo from '../db/repo.js';
import { bus, type DeviceEvent } from '../events/bus.js';
import { broadcast } from '../ws.js';
import { recordAll } from '../cameras/recorder.js';
import { raiseAlert, resolveByKey } from '../alerts/service.js';
import type { Device, Rule } from '../types.js';

/**
 * Event-driven rules. Each device event is matched against the enabled rules (editable on the
 * Alerts page); matching rules record cameras, open live view on dashboards and raise alerts.
 */

/** Device event → the trigger name used in rules. */
const TRIGGER: Partial<Record<DeviceEvent['type'], string>> = {
  smoke: 'smoke',
  door_open: 'door_open',
  vibration: 'vibration',
  temp_warning: 'temp_out_of_range',
  temp_critical: 'temp_out_of_range',
  offline: 'offline',
  low_battery: 'low_battery',
};

export const TRIGGERS = ['smoke', 'door_open', 'vibration', 'temp_out_of_range', 'offline', 'low_battery'] as const;

function describe(e: DeviceEvent): { title: string; message: string; key: string } {
  const d = e.device;
  const loc = repo.getLocation();
  switch (e.type) {
    case 'smoke':
      return { title: `Smoke detected – ${d.name}`, message: `${d.name} reports smoke at ${loc.name}.`, key: `smoke:${d.id}` };
    case 'door_open':
      return { title: `Intrusion – ${d.name} opened`, message: `${d.name} opened while armed at ${loc.name}.`, key: `intrusion:${loc.id}` };
    case 'vibration':
      return { title: `Intrusion – vibration at ${d.name}`, message: `Vibration at ${d.name} while armed at ${loc.name}.`, key: `intrusion:${loc.id}` };
    case 'temp_warning':
    case 'temp_critical': {
      const high = (d.lastValue ?? 0) > Number(d.settings.max);
      return { title: `Temperature ${high ? 'high' : 'low'} – ${d.name}`, message: e.detail ?? `${d.name} out of range`, key: `temp:${d.id}` };
    }
    case 'offline':
      return { title: `${d.name} offline`, message: `${d.name} stopped reporting at ${loc.name}.`, key: `offline:${d.id}` };
    case 'low_battery':
      return { title: `${d.name} battery low`, message: `${d.name} battery at ${d.battery ?? '?'}%. Replace it soon.`, key: `battery:${d.id}` };
    default:
      return { title: d.name, message: e.detail ?? '', key: `${e.type}:${d.id}` };
  }
}

const guarded = (d: Device) => repo.getLocation().armed && d.settings.armedSchedule !== false;

async function run(rule: Rule, e: DeviceEvent) {
  const loc = repo.getLocation();
  const { title, message, key } = describe(e);
  let severity: 'warning' | 'critical' | null = rule.alertSeverity === 'none' ? null : rule.alertSeverity;
  if (e.type === 'temp_critical' && rule.escalateToCritical) severity = 'critical';

  const alert = severity ? await raiseAlert({ severity, title, message, deviceId: e.device.id, ruleId: rule.id, eventId: e.eventId, dedupeKey: key }) : null;

  if (rule.recordCameras) {
    const ids = recordAll(loc.id, alert?.id);
    if (ids.length) broadcast({ type: 'event', event: repo.addEvent(loc.id, { type: 'recording', severity: 'info', message: `Recording started on ${ids.length} cameras (${rule.name})` }) });
  }
  if (rule.openLiveView) {
    const cams = repo.listDevices(loc.id).filter((d) => d.category === 'camera' && d.online);
    if (cams.length) broadcast({ type: 'open_live_view', deviceIds: cams.map((c) => c.id) });
  }
}

export async function handleEvent(e: DeviceEvent) {
  // Causes that went away close their warning-type alerts
  if (e.type === 'temp_recovered') return resolveByKey(`temp:${e.device.id}`, 'back within limits');
  if (e.type === 'online') return resolveByKey(`offline:${e.device.id}`, 'back online');

  const trigger = TRIGGER[e.type];
  if (!trigger) return;
  const loc = repo.getLocation();
  for (const rule of repo.listRules(loc.id)) {
    if (!rule.enabled || !rule.events.includes(trigger)) continue;
    if (rule.armedOnly && !guarded(e.device)) continue;
    try {
      await run(rule, e);
    } catch (err) {
      console.error(`[rules] "${rule.name}" failed:`, (err as Error).message);
    }
  }
}

export function startRulesEngine() {
  bus.on((e) => void handleEvent(e));
}
