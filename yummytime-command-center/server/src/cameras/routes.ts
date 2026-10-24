import fs from 'node:fs';
import path from 'node:path';
import { Router, type Response } from 'express';
import { config, integrationStatus } from '../config.js';
import * as repo from '../db/repo.js';
import { syncImouCameras } from '../imou/sync.js';
import type { Device } from '../types.js';
import { isRecording, startRecording, stopRecording } from './recorder.js';
import { takeSnapshot } from './snapshots.js';
import { forgetStream, streamUrl } from './streams.js';

export const cameras = Router();

/** Hosts the HLS proxy may fetch from — only hosts IMOU handed us a stream URL for (prevents an open proxy). */
const allowedHosts = new Set<string>();

function camera(id: string, res: Response): Device | undefined {
  const d = repo.getDevice(Number(id));
  if (!d || d.category !== 'camera') {
    res.status(404).json({ error: 'Camera not found' });
    return undefined;
  }
  return d;
}

const proxied = (deviceId: number, url: string) => `/api/cameras/${deviceId}/hls?u=${encodeURIComponent(url)}`;

/** Point every URI in a playlist (segments, sub-playlists, keys) back through this server. */
function rewritePlaylist(text: string, base: string, deviceId: number): string {
  return text
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${proxied(deviceId, new URL(u, base).href)}"`);
      return proxied(deviceId, new URL(t, base).href);
    })
    .join('\n');
}

async function sendUpstream(url: string, deviceId: number, res: Response) {
  const up = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!up.ok) return res.status(502).json({ error: `Camera stream returned ${up.status}` });
  const type = up.headers.get('content-type') ?? '';
  const isPlaylist = /mpegurl/i.test(type) || new URL(url).pathname.endsWith('.m3u8');
  res.setHeader('Cache-Control', 'no-store');
  if (isPlaylist) {
    res.type('application/vnd.apple.mpegurl').send(rewritePlaylist(await up.text(), up.url || url, deviceId));
  } else {
    res.type(type || 'video/mp2t').send(Buffer.from(await up.arrayBuffer()));
  }
}

/** Live view entry point for hls.js: /api/cameras/:id/live.m3u8?q=hd|sd */
cameras.get('/:id/live.m3u8', async (req, res) => {
  const d = camera(req.params.id, res);
  if (!d) return;
  if (!d.online) return res.status(409).json({ error: `${d.name} is offline` });
  const quality = req.query.q === 'sd' ? 'sd' : 'hd';
  try {
    const url = await streamUrl(d, quality);
    allowedHosts.add(new URL(url).host);
    await sendUpstream(url, d.id, res);
  } catch (e) {
    forgetStream(d.id);
    res.status(502).json({ error: (e as Error).message });
  }
});

cameras.get('/:id/hls', async (req, res) => {
  const d = camera(req.params.id, res);
  if (!d) return;
  let url: URL;
  try {
    url = new URL(String(req.query.u));
  } catch {
    return res.status(400).json({ error: 'Bad url' });
  }
  if (!['http:', 'https:'].includes(url.protocol) || !allowedHosts.has(url.host)) return res.status(403).json({ error: 'Host not allowed' });
  try {
    await sendUpstream(url.href, d.id, res);
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

cameras.get('/:id/snapshot.jpg', (req, res) => {
  const d = camera(req.params.id, res);
  if (!d) return;
  const rel = repo.latestSnapshot(d.id);
  if (!rel) return res.status(404).json({ error: 'No snapshot yet' });
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(config.dataDir, rel));
});

cameras.post('/:id/snapshot', async (req, res) => {
  const d = camera(req.params.id, res);
  if (!d) return;
  try {
    res.json(await takeSnapshot(d));
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

cameras.post('/:id/record', async (req, res) => {
  const d = camera(req.params.id, res);
  if (!d) return;
  if (!d.online) return res.status(409).json({ error: `${d.name} is offline` });
  const seconds = req.body?.seconds === undefined ? undefined : Number(req.body.seconds);
  if (seconds !== undefined && !(seconds >= 5 && seconds <= 3600)) return res.status(400).json({ error: 'seconds must be 5–3600' });
  await startRecording(d, { reason: 'manual', seconds });
  res.json({ recording: isRecording(d.id) });
});

cameras.post('/:id/record/stop', (req, res) => {
  const d = camera(req.params.id, res);
  if (!d) return;
  stopRecording(d.id);
  res.json({ ok: true });
});

cameras.get('/recordings', (req, res) => {
  const deviceId = req.query.deviceId ? Number(req.query.deviceId) : undefined;
  res.json(repo.listRecordings(deviceId));
});

cameras.get('/recordings/:rid/file', (req, res) => {
  const r = repo.getRecording(Number(req.params.rid));
  if (!r?.filePath) return res.status(404).json({ error: 'Recording not found' });
  const abs = path.join(config.dataDir, r.filePath);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File missing' });
  res.sendFile(abs); // supports range requests, so the browser can seek
});

/** Manually re-import cameras from the IMOU account. */
cameras.post('/imou/sync', async (_req, res) => {
  if (!integrationStatus().imou) return res.status(400).json({ error: 'Set IMOU_APP_ID and IMOU_APP_SECRET in .env first' });
  try {
    res.json(await syncImouCameras());
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});
