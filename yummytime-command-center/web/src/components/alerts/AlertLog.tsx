import { MessageCircle, PhoneCall } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { AlertWithLog } from '../../types';

const STATUS: Record<string, string> = {
  open: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  escalating: 'bg-red-600 text-white',
  acknowledged: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  resolved: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
};
const VIA: Record<string, string> = { dashboard: 'dashboard', phone_keypress: 'phone', whatsapp: 'WhatsApp' };
const when = (iso: string) => new Date(iso).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' });

/** Every alert with who was contacted and who acknowledged, newest first. */
export function AlertLog({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<AlertWithLog[]>([]);
  useEffect(() => {
    api.alertLog().then(setRows).catch(() => {});
  }, [refreshKey]);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="px-4 py-3 font-semibold">Alert log</h3>
      {rows.length === 0 && <p className="border-t border-zinc-200 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800">No alerts yet.</p>}
      <ul>
        {rows.map((a) => (
          <li key={a.id} className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className={`h-2 w-2 shrink-0 self-center rounded-full ${a.severity === 'critical' ? 'bg-red-600' : 'bg-amber-500'}`} />
              <span className="font-medium">{a.title}</span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${STATUS[a.status]}`}>{a.status}</span>
              <span className="ml-auto text-xs text-zinc-500 tabular-nums">{when(a.createdAt)}</span>
            </div>
            {a.acknowledgedBy && (
              <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400">
                Acknowledged by {a.acknowledgedBy} via {VIA[a.ackChannel ?? ''] ?? a.ackChannel} at {when(a.acknowledgedAt!)}
              </p>
            )}
            {a.notifications.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-zinc-500">
                {a.notifications.map((n) => (
                  <li key={n.id} className="flex items-center gap-1.5 tabular-nums">
                    {n.channel === 'voice' ? <PhoneCall size={12} /> : <MessageCircle size={12} />}
                    {new Date(n.createdAt).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })} · {n.channel === 'voice' ? 'Call' : 'WhatsApp'} to {n.contactName ?? n.toNumber} ·{' '}
                    <span className={n.status === 'failed' ? 'text-red-600' : ''}>{n.status}</span>
                    {n.error && <span className="text-red-600">({n.error})</span>}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
