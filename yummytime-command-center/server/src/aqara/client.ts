import crypto from 'node:crypto';
import { config } from '../config.js';
import { getSetting, setSetting } from '../db/repo.js';

/**
 * Aqara Open API v3 client. Every call is POST {base}/v3.0/open/api with body { intent, data }
 * and headers Appid/Keyid/Nonce/Time/Sign (+ Accesstoken). Sign = md5(lowercase(
 * "Accesstoken=..&Appid=..&Keyid=..&Nonce=..&Time=.." + AppKey)). Response: { code, message, result }.
 */

const REGIONS: Record<string, string> = {
  eu: 'https://open-ger.aqara.com',
  us: 'https://open-usa.aqara.com',
  cn: 'https://open-cn.aqara.com',
  kr: 'https://open-kr.aqara.com',
  ru: 'https://open-ru.aqara.com',
};

const AUTH_INTENTS = ['config.auth.getAuthCode', 'config.auth.getToken', 'config.auth.refreshToken'];
const TOKEN_ERRORS = [108, 2004, 2005];

const FRIENDLY: Record<number, string> = {
  2046: 'This Aqara project is not approved yet. Use the APPROVED "DEMO APPLICATION" credentials (AQARA_APP_ID / AQARA_KEY_ID / AQARA_APP_KEY).',
  108: 'Aqara login expired. Connect the Aqara account again (Devices → Aqara).',
};

export class AqaraError extends Error {
  constructor(
    public code: number,
    msg: string,
  ) {
    super(`Aqara ${code}: ${FRIENDLY[code] ?? msg}`);
  }
}

interface StoredToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  account: string;
}

const TOKEN_KEY = 'aqara_token';
const loadToken = (): StoredToken | null => {
  const raw = getSetting(TOKEN_KEY);
  return raw ? (JSON.parse(raw) as StoredToken) : null;
};
const saveToken = (t: StoredToken | null) => setSetting(TOKEN_KEY, t ? JSON.stringify(t) : null);

const baseUrl = () => config.aqara.apiUrl || REGIONS[config.aqara.region] || REGIONS.eu;

async function request<T>(intent: string, data: unknown, token: string | null): Promise<{ code: number; message: string; result: T }> {
  const nonce = crypto.randomBytes(8).toString('hex');
  const time = String(Date.now());
  const plain = `${token ? `Accesstoken=${token}&` : ''}Appid=${config.aqara.appId}&Keyid=${config.aqara.keyId}&Nonce=${nonce}&Time=${time}${config.aqara.appKey}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Appid: config.aqara.appId,
    Keyid: config.aqara.keyId,
    Nonce: nonce,
    Time: time,
    Sign: crypto.createHash('md5').update(plain.toLowerCase()).digest('hex'),
    Lang: 'en',
  };
  if (token) headers.Accesstoken = token;
  const res = await fetch(`${baseUrl()}/v3.0/open/api`, { method: 'POST', headers, body: JSON.stringify({ intent, data }), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new AqaraError(res.status, `HTTP ${res.status}`);
  return (await res.json()) as { code: number; message: string; result: T };
}

let refreshing: Promise<void> | null = null;

async function refresh() {
  const t = loadToken();
  if (!t) throw new AqaraError(108, 'not connected');
  const r = await request<{ accessToken: string; refreshToken: string; expiresIn: string }>('config.auth.refreshToken', { refreshToken: t.refreshToken }, null);
  if (r.code !== 0) {
    saveToken(null);
    throw new AqaraError(108, r.message);
  }
  saveToken({ ...t, accessToken: r.result.accessToken, refreshToken: r.result.refreshToken, expiresAt: Date.now() + Number(r.result.expiresIn) * 1000 });
}

export async function call<T = any>(intent: string, data: unknown = {}, retried = false): Promise<T> {
  const isAuth = AUTH_INTENTS.includes(intent);
  let token: string | null = null;
  if (!isAuth) {
    const t = loadToken();
    if (!t) throw new AqaraError(108, 'not connected');
    // renew a day early
    if (Date.now() > t.expiresAt - 86_400_000) await (refreshing ??= refresh().finally(() => (refreshing = null)));
    token = loadToken()!.accessToken;
  }
  const r = await request<T>(intent, data, token);
  if (!isAuth && TOKEN_ERRORS.includes(r.code) && !retried) {
    await (refreshing ??= refresh().finally(() => (refreshing = null)));
    return call(intent, data, true);
  }
  if (r.code !== 0) throw new AqaraError(r.code, r.message);
  return r.result;
}

// ---------------------------------------------------------------------------
// Account connection (Aqara sends a verification code to the account's email/phone)
// ---------------------------------------------------------------------------

export const connectionStatus = () => {
  const t = loadToken();
  return { connected: !!t, account: t?.account ?? config.aqara.account ?? null, expiresAt: t ? new Date(t.expiresAt).toISOString() : null };
};

export async function sendAuthCode(account: string) {
  await call('config.auth.getAuthCode', { account, accountType: 0, accessTokenValidity: config.aqara.tokenValidity });
}

export async function connect(account: string, authCode: string) {
  const r = await call<{ accessToken: string; refreshToken: string; expiresIn: string }>('config.auth.getToken', { authCode, account, accountType: 0 });
  saveToken({ accessToken: r.accessToken, refreshToken: r.refreshToken, expiresAt: Date.now() + Number(r.expiresIn) * 1000, account });
}

export const disconnect = () => saveToken(null);

// ---------------------------------------------------------------------------
// Devices & resources
// ---------------------------------------------------------------------------

export interface AqaraDevice {
  did: string;
  parentDid?: string;
  model: string;
  modelType: number; // 1 gateway with sub-devices, 2 gateway without, 3 sub-device
  state: number; // 1 online, 0 offline
  deviceName: string;
}

export async function listDevices(): Promise<AqaraDevice[]> {
  const out: AqaraDevice[] = [];
  for (let page = 1; page < 50; page++) {
    const r = await call<{ data?: AqaraDevice[]; totalCount?: number }>('query.device.info', { pageNum: page, pageSize: 50 });
    const rows = r.data ?? [];
    out.push(...rows);
    if (rows.length < 50) break;
  }
  return out;
}

export interface ResourceInfo {
  resourceId: string;
  name?: string;
  description?: string;
  unit?: number | string;
}

const infoCache = new Map<string, ResourceInfo[]>();

/** Resources a model offers (cached). */
export async function resourceInfo(model: string): Promise<ResourceInfo[]> {
  if (!infoCache.has(model)) {
    const r = await call<ResourceInfo[] | { data?: ResourceInfo[] }>('query.resource.info', { model });
    infoCache.set(model, Array.isArray(r) ? r : (r.data ?? []));
  }
  return infoCache.get(model)!;
}

export interface ResourceValue {
  subjectId: string;
  resourceId: string;
  value: string;
  timeStamp?: number;
}

/** Current value of every resource for the given devices (batched 40 per call). */
export async function resourceValues(dids: string[]): Promise<Map<string, Map<string, ResourceValue>>> {
  const out = new Map<string, Map<string, ResourceValue>>();
  for (let i = 0; i < dids.length; i += 40) {
    const batch = dids.slice(i, i + 40);
    const rows = await call<ResourceValue[]>('query.resource.value', { resources: batch.map((subjectId) => ({ subjectId, resourceIds: [] })) });
    for (const r of rows ?? []) {
      if (!out.has(r.subjectId)) out.set(r.subjectId, new Map());
      out.get(r.subjectId)!.set(r.resourceId, r);
    }
  }
  return out;
}
