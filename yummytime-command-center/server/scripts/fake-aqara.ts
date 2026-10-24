/**
 * Fake Aqara Open API (EU) for testing without real devices.
 *
 *   npm run fake:aqara -w server         (listens on http://localhost:4556)
 *   .env:  AQARA_APP_ID=fake AQARA_KEY_ID=fake AQARA_APP_KEY=fake AQARA_API_URL=http://localhost:4556
 *   Login code: 123456
 *
 * Trigger events:   curl -X POST localhost:4556/fake/set -H 'Content-Type: application/json' \
 *                     -d '{"did":"lumi.smoke1","resourceId":"13.1.85","value":"1"}'
 * Device offline:   ... /fake/state -d '{"did":"lumi.door1","state":0}'
 */
import crypto from 'node:crypto';
import express from 'express';

const PORT = Number(process.env.FAKE_AQARA_PORT ?? 4556);
const APP_KEY = process.env.AQARA_APP_KEY || 'fake';
const PENDING = process.env.FAKE_AQARA_PENDING === '1'; // simulate an unapproved project (2046)

const HUB = 'lumi.hub1';
const devices = [
  { did: HUB, model: 'lumi.gateway.agl001', modelType: 1, state: 1, deviceName: 'Hub M3 Capsule' },
  { did: 'lumi.temp1', parentDid: HUB, model: 'lumi.sensor_ht.agl02', modelType: 3, state: 1, deviceName: 'Kjøleskap A' },
  { did: 'lumi.temp2', parentDid: HUB, model: 'lumi.sensor_ht.agl02', modelType: 3, state: 1, deviceName: 'Fryser A' },
  { did: 'lumi.smoke1', parentDid: HUB, model: 'lumi.sensor_smoke.acn03', modelType: 3, state: 1, deviceName: 'Røykvarsler Kjøkken A' },
  { did: 'lumi.door1', parentDid: HUB, model: 'lumi.magnet.agl02', modelType: 3, state: 1, deviceName: 'Bakdør A' },
  { did: 'lumi.vib1', parentDid: HUB, model: 'lumi.vibration.agl01', modelType: 3, state: 1, deviceName: 'Vibrasjon Kasse A' },
  { did: 'lumi.plug1', parentDid: HUB, model: 'lumi.plug.maeu01', modelType: 3, state: 1, deviceName: 'Kaffemaskin' },
];

const info: Record<string, { resourceId: string; name: string }[]> = {
  'lumi.sensor_ht.agl02': [
    { resourceId: '0.1.85', name: 'temperature_value' },
    { resourceId: '0.2.85', name: 'humidity_value' },
    { resourceId: '8.0.2008', name: 'battery voltage' },
  ],
  'lumi.sensor_smoke.acn03': [
    { resourceId: '13.1.85', name: 'smoke alarm status' },
    { resourceId: '0.5.85', name: 'smoke density' },
    { resourceId: '8.0.2001', name: 'battery percentage' },
  ],
  'lumi.magnet.agl02': [
    { resourceId: '3.1.85', name: 'contact status (0 closed, 1 open)' },
    { resourceId: '8.0.2001', name: 'battery percentage' },
  ],
  'lumi.vibration.agl01': [
    { resourceId: '13.1.85', name: 'vibration event' },
    { resourceId: '8.0.2001', name: 'battery percentage' },
  ],
  'lumi.gateway.agl001': [],
  'lumi.plug.maeu01': [{ resourceId: '4.1.85', name: 'switch' }],
};

const now = () => Date.now();
const values: Record<string, Record<string, { value: string; timeStamp: number }>> = {
  'lumi.temp1': { '0.1.85': { value: '310', timeStamp: now() }, '0.2.85': { value: '5500', timeStamp: now() }, '8.0.2008': { value: '3050', timeStamp: now() } },
  'lumi.temp2': { '0.1.85': { value: '-2050', timeStamp: now() }, '0.2.85': { value: '4000', timeStamp: now() }, '8.0.2008': { value: '2950', timeStamp: now() } },
  'lumi.smoke1': { '13.1.85': { value: '0', timeStamp: now() }, '0.5.85': { value: '0', timeStamp: now() }, '8.0.2001': { value: '96', timeStamp: now() } },
  'lumi.door1': { '3.1.85': { value: '0', timeStamp: now() }, '8.0.2001': { value: '15', timeStamp: now() } },
  'lumi.vib1': { '13.1.85': { value: '1', timeStamp: now() - 3600_000 }, '8.0.2001': { value: '80', timeStamp: now() } },
  'lumi.plug1': { '4.1.85': { value: '1', timeStamp: now() } },
};

// Temperatures drift a little
setInterval(() => {
  for (const [did, mean] of [['lumi.temp1', 310], ['lumi.temp2', -2050]] as const) {
    const r = values[did]['0.1.85'];
    if (r.timeStamp > now() - 60_000 && Number(r.value) > mean + 200) continue; // keep a value set via /fake/set for a minute
    r.value = String(Math.round(mean + (Math.random() - 0.5) * 40));
    r.timeStamp = now();
  }
}, 5000);

let token = '';
let refresh = '';
const authCodes = new Set<string>();

const app = express();
app.use(express.json());

app.post('/v3.0/open/api', (req, res) => {
  const h = (k: string) => String(req.header(k) ?? '');
  const plain = `${h('Accesstoken') ? `Accesstoken=${h('Accesstoken')}&` : ''}Appid=${h('Appid')}&Keyid=${h('Keyid')}&Nonce=${h('Nonce')}&Time=${h('Time')}${APP_KEY}`;
  if (h('Sign') !== crypto.createHash('md5').update(plain.toLowerCase()).digest('hex')) return res.json({ code: 302, message: 'sign error' });
  if (PENDING) return res.json({ code: 2046, message: 'project not approved' });
  const { intent, data = {} } = req.body ?? {};
  console.log('[fake-aqara]', intent);
  const ok = (result: unknown = {}) => res.json({ code: 0, message: 'Success', result });

  switch (intent) {
    case 'config.auth.getAuthCode':
      authCodes.add(String(data.account));
      return ok({ authCode: '' });
    case 'config.auth.getToken':
      if (data.authCode !== '123456' || !authCodes.has(String(data.account))) return res.json({ code: 2002, message: 'auth code invalid' });
      token = crypto.randomUUID();
      refresh = crypto.randomUUID();
      return ok({ accessToken: token, refreshToken: refresh, expiresIn: '604800', openId: 'fake' });
    case 'config.auth.refreshToken':
      if (data.refreshToken !== refresh) return res.json({ code: 2005, message: 'refresh token invalid' });
      token = crypto.randomUUID();
      refresh = crypto.randomUUID();
      return ok({ accessToken: token, refreshToken: refresh, expiresIn: '604800' });
  }
  if (!token || h('Accesstoken') !== token) return res.json({ code: 108, message: 'token expired' });

  switch (intent) {
    case 'query.device.info':
      return ok({ data: devices, totalCount: devices.length });
    case 'query.resource.info':
      return ok(info[data.model] ?? []);
    case 'query.resource.value':
      return ok(
        (data.resources ?? []).flatMap((r: { subjectId: string; resourceIds: string[] }) =>
          Object.entries(values[r.subjectId] ?? {})
            .filter(([id]) => !r.resourceIds?.length || r.resourceIds.includes(id))
            .map(([resourceId, v]) => ({ subjectId: r.subjectId, resourceId, value: v.value, timeStamp: v.timeStamp })),
        ),
      );
    default:
      return res.json({ code: 400, message: `fake server does not implement ${intent}` });
  }
});

app.post('/fake/set', (req, res) => {
  const { did, resourceId, value } = req.body ?? {};
  if (!values[did]) return res.status(404).json({ error: 'unknown did' });
  values[did][resourceId] = { value: String(value), timeStamp: now() };
  res.json({ ok: true });
});

app.post('/fake/state', (req, res) => {
  const d = devices.find((x) => x.did === req.body?.did);
  if (!d) return res.status(404).json({ error: 'unknown did' });
  d.state = Number(req.body.state);
  res.json({ ok: true });
});

app.post('/fake/expire-token', (_req, res) => {
  token = crypto.randomUUID(); // forces code 108 → client refresh
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Fake Aqara API on http://localhost:${PORT}/v3.0/open/api (login code 123456)`));
