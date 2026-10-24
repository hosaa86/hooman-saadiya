import type { EventRow } from '../types';
import { clock } from './ui';

const DOT = { info: 'bg-zinc-400', warning: 'bg-amber-500', critical: 'bg-red-600' };

export function EventFeed({ events }: { events: EventRow[] }) {
  return (
    <ol className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
      {events.length === 0 && <li className="p-4 text-sm text-zinc-500">No events yet.</li>}
      {events.map((e) => (
        <li key={e.id} className="flex gap-3 px-3 py-2.5">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[e.severity]}`} />
          <div className="min-w-0 flex-1">
            <p className={`text-sm leading-snug ${e.severity === 'critical' ? 'font-semibold text-red-600 dark:text-red-400' : ''}`}>{e.message}</p>
            <p className="text-xs text-zinc-500">
              {clock(e.createdAt)}
              {e.deviceName && ` · ${e.deviceName}`}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
