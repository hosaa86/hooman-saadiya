import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * IMOU Open API client (https://open.imoulife.com).
 * Every call is a POST of { system: { ver, appId, sign, time, nonce }, id, params } and returns
 * { result: { code, msg, data } } where code "0" = success.
 */

const DATA_CENTERS: Record<string, string> = {
  fk: 'https://openapi-fk.easy4ip.com/openapi', // Central Europe
  sg: 'https://openapi-sg.easy4ip.com/openapi', // Asia
  or: 'https://openapi-or.easy4ip.com/openapi', // America
};

export class ImouError extends Error {
  constructor(
    public code: string,
    msg: string,
  ) {
    super(`IMOU ${code}: ${msg}`);
  }
}

export interface ImouStream {
  hls: string;
  streamId: number;
  status?: string;
  liveToken?: string;
  coverUrl?: string;
}

let token: { value: string; expiresAt: number } | null = null;

const baseUrl = () => config.imou.apiUrl || DATA_CENTERS[config.imou.dataCenter] || DATA_CENTERS.fk;

async function call<T = any>(method: string, params: Record<string, unknown> = {}, retried = false): Promise<T> {
  const time = Math.round(Date.now() / 1000);
  const nonce = crypto.randomUUID();
  const sign = crypto.createHash('md5').update(`time:${time},nonce:${nonce},appSecret:${config.imou.appSecret}`).digest('hex');
  const withToken = method === 'accessToken' ? params : { ...params, token: await accessToken() };

  const res = await fetch(`${baseUrl()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: { ver: '1.0', appId: config.imou.appId, sign, time, nonce },
      id: crypto.randomUUID(),
      params: withToken,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new ImouError(`HTTP${res.status}`, res.statusText);
  const body = (await res.json()) as { result?: { code: string; msg: string; data?: T } };
  const r = body.result;
  if (!r) throw new ImouError('BAD_RESPONSE', JSON.stringify(body).slice(0, 200));
  if (r.code === 'TK1002' && !retried) {
    token = null; // expired token → get a new one and retry once
    return call(method, params, true);
  }
  if (r.code !== '0') throw new ImouError(r.code, r.msg);
  return (r.data ?? {}) as T;
}

async function accessToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt) return token.value;
  const data = await call<{ accessToken: string; expireTime: number }>('accessToken');
  // expireTime is seconds until expiry; renew 5 min early
  token = { value: data.accessToken, expiresAt: Date.now() + (Number(data.expireTime) - 300) * 1000 };
  return token.value;
}

export interface ImouCamera {
  deviceId: string;
  channelId: string;
  name: string;
}

/** All cameras (device + channel) bound to or shared with the account. */
export async function listCameras(): Promise<ImouCamera[]> {
  const base = await call<{ deviceList?: any[] }>('deviceBaseList', { bindId: -1, limit: 128, type: 'bindAndShare', needApInfo: false });
  const ids: string[] = (base.deviceList ?? []).map((d) => d.deviceId);
  if (ids.length === 0) return [];
  const detail = await call<{ deviceList?: any[] }>('deviceBaseDetailList', {
    deviceList: ids.map((deviceId) => ({ deviceId, channelList: '0' })),
  });
  const out: ImouCamera[] = [];
  for (const d of detail.deviceList ?? []) {
    const channels: any[] = d.channels ?? d.channelList ?? [];
    if (channels.length <= 1) {
      out.push({ deviceId: d.deviceId, channelId: String(channels[0]?.channelId ?? '0'), name: d.name ?? d.deviceName ?? channels[0]?.channelName ?? d.deviceId });
    } else {
      for (const c of channels) out.push({ deviceId: d.deviceId, channelId: String(c.channelId), name: c.channelName ?? `${d.name} ${c.channelId}` });
    }
  }
  return out;
}

/** onLine: "0" offline, "1" online, "4" dormant (battery cameras asleep). */
export async function deviceOnline(deviceId: string): Promise<'online' | 'offline' | 'dormant'> {
  const d = await call<{ onLine?: string }>('deviceOnline', { deviceId });
  return d.onLine === '1' ? 'online' : d.onLine === '4' ? 'dormant' : 'offline';
}

/**
 * HLS URL for live view. Reuses an existing live address, or creates one (bindDeviceLive).
 * streamId 0 = HD main stream, 1 = SD sub stream. Prefers the http:// variant (the only one that plays reliably).
 */
export async function liveHlsUrl(deviceId: string, channelId: string, quality: 'hd' | 'sd'): Promise<string> {
  const streamId = quality === 'hd' ? 0 : 1;
  const pick = (streams: ImouStream[] = []) => {
    const mine = streams.filter((s) => Number(s.streamId) === streamId && (s.status === undefined || s.status === '1'));
    return (mine.find((s) => s.hls.startsWith('http://')) ?? mine[0])?.hls;
  };
  try {
    const info = await call<{ streams?: ImouStream[] }>('getLiveStreamInfo', { deviceId, channelId });
    const url = pick(info.streams);
    if (url) return url;
  } catch (e) {
    if (!(e instanceof ImouError) || e.code !== 'LV1002') throw e; // LV1002 = no live address yet
  }
  try {
    const bound = await call<{ streams?: ImouStream[] }>('bindDeviceLive', { deviceId, channelId, streamId });
    const url = pick(bound.streams);
    if (url) return url;
  } catch (e) {
    if (!(e instanceof ImouError) || e.code !== 'LV1001') throw e; // LV1001 = already exists → read it again
  }
  const again = pick((await call<{ streams?: ImouStream[] }>('getLiveStreamInfo', { deviceId, channelId })).streams);
  if (!again) throw new ImouError('NO_STREAM', `No ${quality.toUpperCase()} stream for ${deviceId}`);
  return again;
}

/** Ask the camera for a snapshot; returns a URL where the JPEG appears after a few seconds. */
export async function snapshotUrl(deviceId: string, channelId: string): Promise<string> {
  const d = await call<{ url: string }>('setDeviceSnapEnhanced', { deviceId, channelId });
  if (!d.url) throw new ImouError('NO_URL', 'Snapshot URL missing');
  return d.url;
}
