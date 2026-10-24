import { ArrowLeft, Camera, Circle, Download, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Device, Recording } from '../types';
import { RecBadge } from './CameraTile';
import { CameraFeed } from './CameraFeed';

interface Props {
  cameras: Device[];
  onClose: () => void;
  flash: (msg: string) => void;
}

export function LiveViewModal({ cameras, onClose, flash }: Props) {
  const [focus, setFocus] = useState<number | null>(cameras.length === 1 ? cameras[0].id : null);
  const focused = cameras.find((c) => c.id === focus);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (focus !== null && cameras.length > 1) setFocus(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, focus, cameras.length]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-label="Live view">
      <div className="flex items-center gap-2 px-3 py-3">
        {focused && cameras.length > 1 && (
          <button onClick={() => setFocus(null)} aria-label="All cameras" className="rounded-full p-2 hover:bg-white/10">
            <ArrowLeft size={20} />
          </button>
        )}
        <h2 className="flex-1 truncate font-semibold">Live view · {focused ? focused.name : `${cameras.length} cameras`}</h2>
        <button onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-white/10">
          <X size={22} />
        </button>
      </div>

      {focused ? (
        <SingleCamera camera={focused} flash={flash} />
      ) : (
        <div className="grid flex-1 auto-rows-fr gap-2 overflow-auto p-2 sm:grid-cols-2 xl:grid-cols-3">
          {cameras.map((c) => (
            <button key={c.id} onClick={() => setFocus(c.id)} className="relative min-h-[180px] overflow-hidden rounded-lg text-left">
              {/* SD stream in the grid to save bandwidth */}
              <CameraFeed camera={c} live quality="sd" />
              <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-sm">{c.name}</span>
              {c.lastState === 'recording' && (
                <span className="absolute right-2 top-2">
                  <RecBadge large />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SingleCamera({ camera, flash }: { camera: Device; flash: (msg: string) => void }) {
  const [quality, setQuality] = useState<'hd' | 'sd'>('hd');
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [busy, setBusy] = useState(false);
  const recording = camera.lastState === 'recording';
  const real = camera.provider !== 'mock';

  useEffect(() => {
    if (real) api.recordings(camera.id).then(setRecordings).catch(() => {});
  }, [camera.id, real, recording]); // reload when a recording finishes

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      flash(ok);
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-auto lg:flex-row">
      <div className="relative aspect-video w-full shrink-0 lg:aspect-auto lg:flex-1">
        <CameraFeed camera={camera} live quality={quality} />
        {recording && (
          <span className="absolute right-3 top-3">
            <RecBadge large />
          </span>
        )}
      </div>

      <div className="space-y-4 p-4 lg:w-80 lg:shrink-0 lg:overflow-auto">
        <div className="flex flex-wrap gap-2">
          {recording ? (
            <button disabled={busy} onClick={() => run(() => api.stopRecord(camera.id), 'Recording stopped')} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black">
              <Square size={14} fill="currentColor" /> Stop
            </button>
          ) : (
            <button disabled={busy || !camera.online} onClick={() => run(() => api.record(camera.id), `Recording ${camera.settings.clipSeconds ?? 60}s clip`)} className="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold disabled:opacity-40">
              <Circle size={14} fill="currentColor" /> Record
            </button>
          )}
          {real && (
            <button disabled={busy || !camera.online} onClick={() => run(() => api.snapshot(camera.id), 'Snapshot saved')} className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20 disabled:opacity-40">
              <Camera size={16} /> Snapshot
            </button>
          )}
          {real && (
            <div className="ml-auto flex rounded-lg bg-white/10 p-1 text-xs font-semibold">
              {(['hd', 'sd'] as const).map((q) => (
                <button key={q} onClick={() => setQuality(q)} className={`rounded-md px-2.5 py-1 uppercase ${quality === q ? 'bg-white text-black' : 'text-white/70'}`}>
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>

        {real && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">Recordings</p>
            {recordings.length === 0 && <p className="text-sm text-white/50">No recordings yet.</p>}
            <ul className="space-y-1">
              {recordings.map((r) => (
                <li key={r.id}>
                  <a href={`/api/cameras/recordings/${r.id}/file`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/10">
                    <Download size={14} className="shrink-0 text-white/50" />
                    <span className="flex-1">{new Date(r.startedAt).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'medium' })}</span>
                    <span className="text-xs text-white/50">
                      {r.endedAt ? `${r.reason} · ${((r.sizeBytes ?? 0) / 1e6).toFixed(1)} MB` : 'recording…'}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
