import { config, integrationStatus } from '../config.js';
import * as repo from '../db/repo.js';
import { applyReading, type Reading } from '../devices/ingest.js';
import { broadcast } from '../ws.js';
import type { Category, Device } from '../types.js';
import * as aqara from './client.js';

/** How a device's Aqara resources map to what the dashboard shows. Editable per device. */
export interface AqaraMapping {
  valueRes?: string; // temperature
  valueScale?: number; // Aqara reports 0.01 °C → 0.01
  stateRes?: string; // smoke / door / vibration
  alarmValue?: string; // value that means smoke / open / vibration
  batteryRes?: string;
  batteryMode?: 'percent' | 'mv';
}

export function kindFor(model: string, modelType: number): { category: Category; kind: string } | null {
  const m = model.toLowerCase();
  if (modelType === 1 || modelType === 2 || /gateway|hub|acpartner|camera\.gw/.test(m)) return { category: 'hub', kind: 'hub' };
  if (/smoke/.test(m)) return { category: 'detector', kind: 'smoke' };
  if (/magnet|door|contact/.test(m)) return { category: 'detector', kind: 'door' };
  if (/vibration/.test(m)) return { category: 'detector', kind: 'vibration' };
  if (/sensor_ht|weather|temp|\.th\d|airm|airmonitor/.test(m)) return { category: 'sensor', kind: 'temperature' };
  return null;
}

/** Guess resource IDs from the model's resource names, falling back to common Aqara IDs. */
export function detectMapping(kind: string, info: aqara.ResourceInfo[], values: Map<string, aqara.ResourceValue> | undefined): AqaraMapping {
  const text = (r: aqara.ResourceInfo) => `${r.name ?? ''} ${r.description ?? ''}`.toLowerCase();
  const find = (re: RegExp, fallbacks: string[]) =>
    info.find((r) => re.test(text(r)))?.resourceId ?? fallbacks.find((id) => values?.has(id) || info.some((r) => r.resourceId === id)) ?? fallbacks[0];
  const pct = info.find((r) => /battery.*(percent|level|%)|remaining/.test(text(r)))?.resourceId ?? (values?.has('8.0.2001') ? '8.0.2001' : undefined);
  const battery: AqaraMapping = pct
    ? { batteryRes: pct, batteryMode: 'percent' }
    : { batteryRes: find(/battery|voltage/, ['8.0.2008']), batteryMode: 'mv' };

  switch (kind) {
    case 'temperature':
      return { valueRes: find(/temperature/, ['0.1.85']), valueScale: 0.01, ...battery };
    case 'smoke':
      return { stateRes: find(/smoke.*(alarm|status|detect)|alarm status|fire/, ['13.1.85', '0.5.85']), alarmValue: '1', ...battery };
    case 'door':
      return { stateRes: find(/contact|magnet|door|open.*state|status.*open/, ['3.1.85']), alarmValue: '1', ...battery };
    case 'vibration':
      return { stateRes: find(/vibrat/, ['13.1.85']), alarmValue: '', ...battery };
    default:
      return {};
  }
}

const aqaraDevices = (locationId: number) => repo.listDevices(locationId).filter((d) => d.provider === 'aqara' && d.externalId);

export interface AqaraSyncResult {
  found: number;
  added: string[];
  unsupported: string[];
}

/** Import Aqara devices (existing ones keep their name and settings). Real devices replace the mock ones. */
export async function syncAqara(): Promise<AqaraSyncResult> {
  const loc = repo.getLocation();
  const remote = await aqara.listDevices();
  const values = await aqara.resourceValues(remote.map((d) => d.did)).catch(() => new Map());
  const added: string[] = [];
  const unsupported: string[] = [];

  for (const r of remote) {
    const k = kindFor(r.model, r.modelType);
    if (!k) {
      unsupported.push(`${r.deviceName} (${r.model})`);
      continue;
    }
    const existing = repo.findDeviceByExternal('aqara', r.did, '0');
    if (existing && existing.settings.aqara) continue;
    const info = await aqara.resourceInfo(r.model).catch(() => []);
    const mapping = detectMapping(k.kind, info, values.get(r.did));
    const device = existing ?? repo.createDevice(loc.id, { ...k, provider: 'aqara', externalId: r.did, name: r.deviceName || r.model });
    const settings: Record<string, unknown> = { ...device.settings, aqara: mapping, model: r.model };
    // New sensor reading below −10 °C is a freezer: start with freezer limits instead of fridge limits
    const first = !existing && k.kind === 'temperature' ? toReading({ ...device, settings }, values.get(r.did)).value : null;
    if (first != null && first < -10) Object.assign(settings, { min: -25, max: -18, criticalMargin: 3 });
    repo.updateDevice(device.id, { settings });
    if (!existing) added.push(device.name);
  }

  // Replace mock sensors/detectors/hub once real Aqara devices exist (archived mocks keep their logs)
  const realCats = new Set(remote.map((r) => kindFor(r.model, r.modelType)?.category).filter(Boolean));
  for (const d of repo.listDevices(loc.id)) {
    if (d.provider === 'mock' && realCats.has(d.category)) repo.deleteDevice(d.id);
  }

  broadcast({ type: 'devices_changed' });
  broadcast({
    type: 'event',
    event: repo.addEvent(loc.id, { type: 'system', severity: 'info', message: `Aqara sync: ${remote.length} devices found, ${added.length} added` }),
  });
  baselineDone.clear();
  await pollAqara(true);
  return { found: remote.length, added, unsupported };
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

const baselineDone = new Set<number>();
const lastVibration = new Map<number, number>();
let pollCount = 0;
export const pollState = { lastPollAt: null as string | null, lastError: null as string | null };

function toReading(d: Device, values: Map<string, aqara.ResourceValue> | undefined): Reading {
  const m = (d.settings.aqara ?? {}) as AqaraMapping;
  const r: Reading = {};
  if (!values) return r;
  const v = (id?: string) => (id ? values.get(id) : undefined);

  const bat = v(m.batteryRes);
  if (bat && bat.value !== '') {
    const n = Number(bat.value);
    r.battery = m.batteryMode === 'mv' ? Math.max(0, Math.min(100, Math.round(((n - 2800) / 300) * 100))) : Math.round(n);
  }
  if (d.kind === 'temperature') {
    const t = v(m.valueRes);
    if (t && t.value !== '' && Number.isFinite(Number(t.value))) r.value = Math.round(Number(t.value) * (m.valueScale ?? 0.01) * 10) / 10;
  }
  const s = v(m.stateRes);
  if (s) {
    if (d.kind === 'smoke') r.state = s.value === (m.alarmValue ?? '1') ? 'smoke' : 'clear';
    if (d.kind === 'door') r.state = s.value === (m.alarmValue ?? '1') ? 'open' : 'closed';
    if (d.kind === 'vibration') {
      // Vibration is an event: a new timestamp (with a non-zero value) means it just happened
      const ts = Number(s.timeStamp ?? 0);
      const prev = lastVibration.get(d.id);
      lastVibration.set(d.id, ts);
      if (prev !== undefined && ts > prev && s.value !== '0' && (!m.alarmValue || s.value === m.alarmValue)) r.state = 'vibration';
      else if (d.lastState !== 'still' && Date.now() - ts > 30_000) r.state = 'still';
    }
  }
  return r;
}

export async function pollAqara(withDeviceInfo = false) {
  if (!integrationStatus().aqara || !aqara.connectionStatus().connected) return;
  const loc = repo.getLocation();
  const devices = aqaraDevices(loc.id);
  if (devices.length === 0) return;
  try {
    const values = await aqara.resourceValues(devices.map((d) => d.externalId!));
    let online: Map<string, aqara.AqaraDevice> | null = null;
    if (withDeviceInfo || pollCount++ % 6 === 0) online = new Map((await aqara.listDevices()).map((r) => [r.did, r]));

    for (const d of devices) {
      const reading = toReading(d, values.get(d.externalId!));
      if (online) {
        const info = online.get(d.externalId!);
        reading.online = info ? info.state === 1 : false;
        if (d.kind === 'hub') {
          reading.value = [...online.values()].filter((x) => x.parentDid === d.externalId).length;
          reading.state = reading.online ? 'connected' : 'disconnected';
        }
      } else if (values.has(d.externalId!) && !d.online && !baselineDone.has(d.id)) {
        reading.online = true;
      }
      applyReading(repo.getDevice(d.id) ?? d, reading, { baseline: !baselineDone.has(d.id) });
      baselineDone.add(d.id);
    }
    pollState.lastPollAt = new Date().toISOString();
    pollState.lastError = null;
  } catch (e) {
    const msg = (e as Error).message;
    if (msg !== pollState.lastError) console.error('[aqara] poll failed:', msg);
    pollState.lastError = msg;
  }
}

export function startAqara() {
  const run = async () => {
    if (!aqara.connectionStatus().connected) return console.log('[aqara] not connected — open Devices → Aqara to log in');
    const r = await syncAqara();
    console.log(`[aqara] ${r.found} devices found, ${r.added.length} added${r.unsupported.length ? `, unsupported: ${r.unsupported.join(', ')}` : ''}`);
  };
  run().catch((e) => {
    pollState.lastError = e.message;
    console.error('[aqara] sync failed:', e.message);
  });
  setInterval(() => pollAqara(), config.aqara.pollSec * 1000);
}
