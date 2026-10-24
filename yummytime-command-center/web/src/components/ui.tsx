import type { ReactNode } from 'react';
import type { Status } from '../types';

export const STATUS_LABEL: Record<Status, string> = {
  ok: 'OK',
  warning: 'Warning',
  critical: 'Critical',
  offline: 'Offline',
};

export const STATUS_DOT: Record<Status, string> = {
  ok: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-600',
  offline: 'bg-zinc-400 dark:bg-zinc-600',
};

export const STATUS_TEXT: Record<Status, string> = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  critical: 'text-red-600 dark:text-red-400',
  offline: 'text-zinc-500',
};

/** Left accent + tint used on device cards. */
export const STATUS_CARD: Record<Status, string> = {
  ok: 'border-l-emerald-500',
  warning: 'border-l-amber-500 bg-amber-50/60 dark:bg-amber-500/5',
  critical: 'border-l-red-600 bg-red-50 dark:bg-red-500/10',
  offline: 'border-l-zinc-400 dark:border-l-zinc-600 opacity-70',
};

export const SEVERITY_RANK: Record<Status, number> = { ok: 0, offline: 1, warning: 2, critical: 3 };

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${STATUS_TEXT[status]}`}>
      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Card({ status, children, className = '' }: { status: Status; children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-l-4 border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${STATUS_CARD[status]} ${className}`}
    >
      {children}
    </div>
  );
}

export function Section({ title, count, children, action }: { title: string; count: number; children: ReactNode; action?: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {title} <span className="ml-1 text-zinc-400">{count}</span>
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('nb-NO');
}

export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Number with a proper minus sign (−20.5), for temperatures. */
export const temp = (v: number, digits?: number) => (digits === undefined ? String(v) : v.toFixed(digits)).replace('-', '−');
