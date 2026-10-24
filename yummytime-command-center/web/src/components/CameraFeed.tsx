import { CameraOff, ImageOff } from 'lucide-react';
import type { Device } from '../types';
import { HlsPlayer } from './HlsPlayer';
import { MockFeed } from './MockFeed';
import { timeAgo } from './ui';

/**
 * Tile: latest snapshot (refreshed by the server every few minutes).
 * Live: HLS stream through the local proxy. Mock cameras use the placeholder feed.
 */
export function CameraFeed({ camera, live = false, quality = 'hd' }: { camera: Device; live?: boolean; quality?: 'hd' | 'sd' }) {
  if (camera.provider === 'mock') return <MockFeed camera={camera} large={live} />;

  if (!camera.online) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-zinc-200 text-zinc-500 dark:bg-zinc-800">
        <CameraOff size={live ? 40 : 24} />
        <span className="text-xs font-medium">Offline</span>
      </div>
    );
  }

  if (live) return <HlsPlayer key={`${camera.id}-${quality}`} src={`/api/cameras/${camera.id}/live.m3u8?q=${quality}`} />;

  if (!camera.snapshotAt) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-zinc-800 text-zinc-400">
        <ImageOff size={22} />
        <span className="text-[11px]">Tap for live view</span>
      </div>
    );
  }
  return (
    <div className="relative h-full w-full bg-black">
      <img src={`/api/cameras/${camera.id}/snapshot.jpg?t=${encodeURIComponent(camera.snapshotAt)}`} alt={camera.name} className="h-full w-full object-cover" />
      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/80">{timeAgo(camera.snapshotAt)}</span>
    </div>
  );
}
