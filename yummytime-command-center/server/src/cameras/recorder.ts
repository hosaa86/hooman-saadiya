import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { config } from '../config.js';
import * as repo from '../db/repo.js';
import { broadcast } from '../ws.js';
import type { Device } from '../types.js';
import { forgetStream, streamUrl } from './streams.js';

interface Active {
  recordingId: number;
  proc?: ChildProcess;
  timer?: NodeJS.Timeout;
  /** Keep starting new clips until stopped (continuous mode). */
  loop: boolean;
}

const active = new Map<number, Active>();

let ffmpeg: string | null | undefined;

/** FFMPEG_PATH, else ffmpeg installed on the PC, else the bundled ffmpeg-static binary. null = none works. */
export function ffmpegBinary(): string | null {
  if (ffmpeg !== undefined) return ffmpeg;
  const runs = (bin: string) => spawnSync(bin, ['-version'], { stdio: 'ignore', timeout: 10_000 }).status === 0;
  let bundled: string | null = null;
  try {
    bundled = createRequire(import.meta.url)('ffmpeg-static') as string | null;
  } catch {}
  const candidates = [config.recording.ffmpegPath, 'ffmpeg', bundled].filter((x): x is string => !!x);
  ffmpeg = candidates.find(runs) ?? null;
  console.log(ffmpeg ? `[rec] using ffmpeg: ${ffmpeg}` : '[rec] ffmpeg not found — camera recording disabled (install ffmpeg or set FFMPEG_PATH)');
  return ffmpeg;
}

export const isRecording = (deviceId: number) => active.has(deviceId);

function setState(device: Device, recording: boolean) {
  const d = repo.updateDeviceState(device.id, { lastState: recording ? 'recording' : 'idle', online: device.online });
  broadcast({ type: 'device_update', device: d });
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

/**
 * Record one clip (or loop clips for continuous mode) to data/recordings/<deviceId>/<date>/<time>-<reason>.mp4.
 * Mock cameras only flip the REC state for the clip length.
 */
export async function startRecording(device: Device, opts: { reason: 'manual' | 'event' | 'continuous'; seconds?: number; alertId?: number }) {
  if (active.has(device.id) || !device.online) return;
  const seconds = opts.seconds ?? Number(device.settings.clipSeconds ?? 60);
  const loop = opts.reason === 'continuous';

  if (device.provider !== 'imou') {
    const recordingId = repo.startRecordingRow(device.id, opts.reason, null, opts.alertId);
    const entry: Active = { recordingId, loop };
    if (!loop) entry.timer = setTimeout(() => finish(device.id, null), seconds * 1000);
    active.set(device.id, entry);
    setState(device, true);
    return;
  }

  const bin = ffmpegBinary();
  if (!bin) return;
  let url: string;
  try {
    url = await streamUrl(device, 'hd');
  } catch (e) {
    console.error(`[rec] ${device.name}: no stream`, (e as Error).message);
    return;
  }
  const rel = path.join('recordings', String(device.id), new Date().toISOString().slice(0, 10), `${stamp()}-${opts.reason}.mp4`);
  const abs = path.join(config.dataDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });

  // Video copied as-is; audio re-encoded to AAC so G.711 audio from IMOU fits in MP4
  const proc = spawn(
    bin,
    ['-hide_banner', '-loglevel', 'error', '-y', '-i', url, '-t', String(seconds), '-c:v', 'copy', '-c:a', 'aac', '-movflags', '+faststart', abs],
    { stdio: ['pipe', 'ignore', 'pipe'] },
  );
  let stderr = '';
  proc.stderr?.on('data', (b) => (stderr = (stderr + b).slice(-2000)));
  const recordingId = repo.startRecordingRow(device.id, opts.reason, rel.split(path.sep).join('/'), opts.alertId);
  active.set(device.id, { recordingId, proc, loop });
  setState(device, true);

  proc.on('error', (e) => console.error(`[rec] ${device.name}: ffmpeg failed to start — install ffmpeg or set FFMPEG_PATH`, e.message));
  proc.on('close', (code) => {
    if (code !== 0 && code !== 255) {
      console.error(`[rec] ${device.name}: ffmpeg exited ${code ?? 'by crash/signal'}`, stderr.trim());
      forgetStream(device.id); // stream URL may have changed
    }
    const size = fs.existsSync(abs) ? fs.statSync(abs).size : 0;
    if (size === 0) fs.rmSync(abs, { force: true });
    finish(device.id, size || null, size === 0);
  });
}

function finish(deviceId: number, sizeBytes: number | null, discard = false) {
  const a = active.get(deviceId);
  if (!a) return;
  active.delete(deviceId);
  if (discard) {
    repo.deleteMediaRows([a.recordingId], []);
    a.loop = false; // don't hammer a failing stream in continuous mode; the status poll restarts it
  } else {
    repo.endRecordingRow(a.recordingId, sizeBytes);
  }
  const device = repo.getDevice(deviceId);
  if (!device) return;
  if (a.loop && device.online && device.settings.recordingMode === 'continuous') {
    startRecording(device, { reason: 'continuous' });
  } else {
    setState(device, false);
  }
}

export function stopRecording(deviceId: number) {
  const a = active.get(deviceId);
  if (!a) return;
  a.loop = false;
  if (a.timer) {
    clearTimeout(a.timer);
    return finish(deviceId, null);
  }
  // 'q' lets ffmpeg finalise the MP4; force-kill if it doesn't exit
  a.proc?.stdin?.write('q');
  setTimeout(() => a.proc?.kill('SIGKILL'), 5000).unref();
}

/** Event recording on every online camera whose mode isn't "off". Returns camera ids that are recording. */
export function recordAll(locationId: number, alertId?: number): number[] {
  const cams = repo.listDevices(locationId).filter((d) => d.category === 'camera' && d.online && d.settings.recordingMode !== 'off');
  cams.forEach((c) => startRecording(c, { reason: 'event', alertId }));
  return cams.map((c) => c.id);
}

/** Start/stop continuous recording to match each camera's setting. */
export function syncContinuous(locationId: number) {
  for (const d of repo.listDevices(locationId).filter((x) => x.category === 'camera')) {
    const want = d.online && d.settings.recordingMode === 'continuous';
    const a = active.get(d.id);
    if (want && !a) startRecording(d, { reason: 'continuous' });
    else if (!want && a?.loop) stopRecording(d.id);
    else if (!a && d.lastState === 'recording') setState(d, false); // stale state from a previous run
  }
}

/** Stop non-continuous recordings (demo reset). */
export function stopEventRecordings() {
  for (const [id, a] of active) if (!a.loop) stopRecording(id);
}

/** Delete recordings and snapshots older than RECORDING_RETENTION_DAYS. */
export function cleanupOldMedia() {
  const { recordings, snapshots } = repo.expiredMedia(config.recording.retentionDays);
  for (const f of [...recordings.map((r) => r.file_path), ...snapshots.map((s) => s.file_path)]) {
    if (f) fs.rmSync(path.join(config.dataDir, f), { force: true });
  }
  repo.deleteMediaRows(recordings.map((r) => r.id), snapshots.map((s) => s.id));
  if (recordings.length + snapshots.length > 0) console.log(`[media] removed ${recordings.length} recordings, ${snapshots.length} snapshots`);
}
