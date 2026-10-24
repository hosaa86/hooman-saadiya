import * as repo from '../db/repo.js';
import { config } from '../config.js';
import { broadcast, clientCount } from '../ws.js';
import { syncContinuous } from '../cameras/recorder.js';
import { takeSnapshot } from '../cameras/snapshots.js';
import * as imou from './client.js';

export interface SyncResult {
  found: number;
  added: string[];
  removedMock: number;
}

/** Import IMOU cameras into the devices table (existing ones keep the name you gave them). */
export async function syncImouCameras(): Promise<SyncResult> {
  const loc = repo.getLocation();
  const cams = await imou.listCameras();
  const added: string[] = [];
  for (const c of cams) {
    if (repo.findDeviceByExternal('imou', c.deviceId, c.channelId)) continue;
    repo.createDevice(loc.id, { category: 'camera', kind: 'camera', provider: 'imou', externalId: c.deviceId, channelId: c.channelId, name: c.name });
    added.push(c.name);
  }
  // Real cameras replace the mock placeholders
  let removedMock = 0;
  if (cams.length > 0) {
    for (const d of repo.listDevices(loc.id)) {
      if (d.category === 'camera' && d.provider === 'mock') {
        repo.deleteDevice(d.id);
        removedMock++;
      }
    }
  }
  if (added.length || removedMock) {
    broadcast({ type: 'devices_changed' });
    broadcast({
      type: 'event',
      event: repo.addEvent(loc.id, { type: 'system', severity: 'info', message: `IMOU sync: ${cams.length} cameras found, ${added.length} added` }),
    });
  }
  await pollStatus();
  return { found: cams.length, added, removedMock };
}

/** Refresh online/offline for each IMOU camera; log changes to the event feed. */
export async function pollStatus() {
  const loc = repo.getLocation();
  for (const d of repo.listDevices(loc.id).filter((x) => x.provider === 'imou' && x.externalId)) {
    let online: boolean;
    try {
      online = (await imou.deviceOnline(d.externalId!)) !== 'offline';
    } catch (e) {
      console.error(`[imou] status ${d.name}:`, (e as Error).message);
      continue;
    }
    const wasOnline = d.online && d.status !== 'offline';
    if (online === wasOnline) {
      // unchanged; still bump last_seen for online cameras
      if (online) repo.updateDeviceState(d.id, { online: true });
      continue;
    }
    const updated = repo.updateDeviceState(d.id, { online, status: online ? 'ok' : 'offline', ...(online ? {} : { lastState: 'idle' }) });
    broadcast({ type: 'device_update', device: updated });
    broadcast({
      type: 'event',
      event: repo.addEvent(loc.id, {
        deviceId: d.id,
        type: online ? 'online' : 'offline',
        severity: online ? 'info' : 'warning',
        message: online ? `${d.name} camera is back online` : `${d.name} camera went offline`,
      }),
    });
  }
  syncContinuous(loc.id);
}

async function snapshotAll() {
  if (clientCount() === 0) return; // nobody is watching — save API quota
  const loc = repo.getLocation();
  for (const d of repo.listDevices(loc.id).filter((x) => x.provider === 'imou' && x.online)) {
    await takeSnapshot(d).catch((e) => console.error(`[imou] snapshot ${d.name}:`, e.message));
  }
}

export function startImou() {
  const run = (name: string, fn: () => Promise<unknown>) => fn().catch((e) => console.error(`[imou] ${name} failed:`, e.message));
  run('sync', async () => {
    const r = await syncImouCameras();
    console.log(`[imou] ${r.found} cameras found, ${r.added.length} added`);
    await snapshotAll();
  });
  setInterval(() => run('status', pollStatus), config.imou.statusPollSec * 1000);
  setInterval(() => run('snapshot', snapshotAll), config.imou.snapshotIntervalMin * 60_000);
}

