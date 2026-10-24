import * as imou from '../imou/client.js';
import type { Device } from '../types.js';

const TTL_MS = 10 * 60_000;
const cache = new Map<string, { url: string; at: number }>();

/** Upstream HLS URL for a camera (cached; IMOU live addresses are long-lived). */
export async function streamUrl(device: Device, quality: 'hd' | 'sd'): Promise<string> {
  if (device.provider !== 'imou' || !device.externalId) throw new Error(`${device.name} has no live stream`);
  const key = `${device.id}:${quality}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.url;
  const url = await imou.liveHlsUrl(device.externalId, device.channelId ?? '0', quality);
  cache.set(key, { url, at: Date.now() });
  return url;
}

export function forgetStream(deviceId: number) {
  for (const k of cache.keys()) if (k.startsWith(`${deviceId}:`)) cache.delete(k);
}
