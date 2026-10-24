import { CameraOff } from 'lucide-react';
import type { Device } from '../types';
import { useNow } from '../useNow';

/** Placeholder "video" until the IMOU HLS stream is wired in (step 4). */
export function MockFeed({ camera, large = false }: { camera: Device; large?: boolean }) {
  const now = useNow();
  const hue = (camera.id * 47) % 360;

  if (!camera.online) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-zinc-200 text-zinc-500 dark:bg-zinc-800">
        <CameraOff size={large ? 40 : 24} />
        <span className="text-xs font-medium">Offline</span>
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        background: `radial-gradient(ellipse at 30% 70%, hsl(${hue} 25% 32%), transparent 60%),
                     radial-gradient(ellipse at 75% 30%, hsl(${(hue + 60) % 360} 20% 26%), transparent 55%),
                     linear-gradient(160deg, hsl(${hue} 12% 16%), hsl(${hue} 10% 8%))`,
      }}
    >
      {/* scanlines */}
      <div className="absolute inset-0 opacity-20 [background:repeating-linear-gradient(0deg,transparent_0,transparent_2px,rgba(0,0,0,.6)_3px)]" />
      <span className={`absolute left-2 top-2 font-mono text-white/80 drop-shadow ${large ? 'text-sm' : 'text-[10px]'}`}>
        {large && `${now.toLocaleDateString('nb-NO')} `}{now.toLocaleTimeString('nb-NO')}
      </span>
      <span className={`absolute bottom-2 left-2 font-mono uppercase text-white/70 ${large ? 'text-sm' : 'text-[10px]'}`}>
        CAM {String(camera.sortOrder + 1).padStart(2, '0')} · MOCK
      </span>
    </div>
  );
}
