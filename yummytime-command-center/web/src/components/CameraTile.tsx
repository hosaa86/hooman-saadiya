import type { Device } from '../types';
import { MockFeed } from './MockFeed';
import { STATUS_DOT } from './ui';

export function RecBadge({ large = false }: { large?: boolean }) {
  return (
    <span className={`flex items-center gap-1 rounded bg-red-600 font-bold text-white ${large ? 'px-2 py-1 text-xs' : 'px-1.5 py-0.5 text-[10px]'}`}>
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> REC
    </span>
  );
}

export function CameraTile({ camera, onOpen }: { camera: Device; onOpen: () => void }) {
  const recording = camera.lastState === 'recording';
  const show = (f: string) => camera.visibleFields.includes(f);

  return (
    <button
      onClick={onOpen}
      disabled={!camera.online}
      className="group overflow-hidden rounded-xl border border-zinc-200 bg-white text-left shadow-sm transition hover:shadow-md disabled:cursor-default dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="relative aspect-video">
        {show('live') && <MockFeed camera={camera} />}
        {show('rec') && recording && (
          <span className="absolute right-2 top-2">
            <RecBadge />
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="truncate text-sm font-medium">{camera.name}</span>
        {show('status') && <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[camera.status]}`} />}
      </div>
    </button>
  );
}
