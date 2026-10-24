import { Router } from 'express';
import { config, integrationStatus } from '../config.js';
import * as repo from '../db/repo.js';
import * as aqara from './client.js';
import { pollState, syncAqara } from './sync.js';

export const aqaraRoutes = Router();

const guard = (res: import('express').Response) => {
  if (integrationStatus().aqara) return true;
  res.status(400).json({ error: 'Set AQARA_APP_ID, AQARA_KEY_ID and AQARA_APP_KEY in .env first (approved DEMO APPLICATION project)' });
  return false;
};

aqaraRoutes.get('/status', (_req, res) => {
  const loc = repo.getLocation();
  res.json({
    configured: integrationStatus().aqara,
    region: config.aqara.region,
    pollSec: config.aqara.pollSec,
    ...aqara.connectionStatus(),
    ...pollState,
    deviceCount: repo.listDevices(loc.id).filter((d) => d.provider === 'aqara').length,
  });
});

aqaraRoutes.post('/auth/code', async (req, res) => {
  if (!guard(res)) return;
  const account = String(req.body?.account ?? '').trim();
  if (!account) return res.status(400).json({ error: 'Enter the Aqara account (email or phone)' });
  try {
    await aqara.sendAuthCode(account);
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

aqaraRoutes.post('/auth/connect', async (req, res) => {
  if (!guard(res)) return;
  const account = String(req.body?.account ?? '').trim();
  const code = String(req.body?.code ?? '').trim();
  if (!account || !code) return res.status(400).json({ error: 'Account and verification code are required' });
  try {
    await aqara.connect(account, code);
    res.json({ ok: true, sync: await syncAqara() });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

aqaraRoutes.post('/disconnect', (_req, res) => {
  aqara.disconnect();
  res.json({ ok: true });
});

aqaraRoutes.post('/sync', async (_req, res) => {
  if (!guard(res)) return;
  try {
    res.json(await syncAqara());
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

/** Every resource of one device with its current value — to check or fix the resource mapping. */
aqaraRoutes.get('/devices/:id/resources', async (req, res) => {
  const d = repo.getDevice(Number(req.params.id));
  if (!d || d.provider !== 'aqara' || !d.externalId) return res.status(404).json({ error: 'Aqara device not found' });
  try {
    const [info, values] = await Promise.all([
      d.settings.model ? aqara.resourceInfo(String(d.settings.model)).catch(() => []) : Promise.resolve([]),
      aqara.resourceValues([d.externalId]),
    ]);
    const vals = values.get(d.externalId) ?? new Map();
    const ids = [...new Set([...info.map((i) => i.resourceId), ...vals.keys()])].sort();
    res.json(
      ids.map((id) => {
        const i = info.find((x) => x.resourceId === id);
        const v = vals.get(id);
        return { resourceId: id, name: i?.name ?? i?.description ?? '', value: v?.value ?? null, time: v?.timeStamp ? new Date(Number(v.timeStamp)).toISOString() : null };
      }),
    );
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});
