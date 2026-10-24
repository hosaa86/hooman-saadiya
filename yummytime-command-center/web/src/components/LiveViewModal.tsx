import { X } from 'lucide-react';
import { useEffect } from 'react';
import type { Device } from '../types';
import { RecBadge } from './CameraTile';
import { MockFeed } from './MockFeed';

export function LiveViewModal({ cameras, onClose }: { cameras: Device[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const single = cameras.length === 1;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-label="Live view">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="font-semibold">Live view · {single ? cameras[0].name : `${cameras.length} cameras`}</h2>
        <button onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-white/10">
          <X size={22} />
        </button>
      </div>
      <div className={`grid flex-1 auto-rows-fr gap-2 overflow-auto p-2 ${single ? '' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
        {cameras.map((c) => (
          <div key={c.id} className="relative min-h-[180px] overflow-hidden rounded-lg">
            <MockFeed camera={c} large />
            <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-sm">{c.name}</span>
            {c.lastState === 'recording' && (
              <span className="absolute right-2 top-2">
                <RecBadge large />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
