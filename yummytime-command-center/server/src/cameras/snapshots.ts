import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import * as repo from '../db/repo.js';
import * as imou from '../imou/client.js';
import { broadcast } from '../ws.js';
import type { Device } from '../types.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Take a snapshot via IMOU and save it under data/snapshots/<deviceId>/. */
export async function takeSnapshot(device: Device): Promise<Device> {
  if (device.provider !== 'imou' || !device.externalId) throw new Error('Snapshots need a real IMOU camera');
  const url = await imou.snapshotUrl(device.externalId, device.channelId ?? '0');
  // The image is uploaded by the camera a moment after the request
  let img: ArrayBuffer | null = null;
  for (let i = 0; i < 4 && !img; i++) {
    await sleep(i === 0 ? 2500 : 2000);
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (res?.ok) img = await res.arrayBuffer();
  }
  if (!img) throw new Error(`Snapshot from ${device.name} was not ready in time`);

  const rel = `snapshots/${device.id}/${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.jpg`;
  const abs = path.join(config.dataDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, Buffer.from(img));
  repo.addSnapshot(device.id, rel);
  const updated = repo.getDevice(device.id)!;
  broadcast({ type: 'device_update', device: updated });
  return updated;
}
