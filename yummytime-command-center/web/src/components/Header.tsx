import { Moon, Shield, ShieldOff, Sun, Wifi, WifiOff } from 'lucide-react';
import type { Device, Location } from '../types';
import { SEVERITY_RANK, StatusPill } from './ui';

export type Page = 'dashboard' | 'devices' | 'alerts' | 'reports';
export const PAGES: Page[] = ['dashboard', 'devices', 'alerts', 'reports'];

interface Props {
  location: Location;
  devices: Device[];
  connected: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onToggleArmed: () => void;
  page: Page;
}

export function Header({ location, devices, connected, theme, onToggleTheme, onToggleArmed, page }: Props) {
  const counts = { ok: 0, warning: 0, critical: 0, offline: 0 };
  devices.forEach((d) => counts[d.status]++);
  const overall = devices.reduce<keyof typeof counts>(
    (worst, d) => (SEVERITY_RANK[d.status] > SEVERITY_RANK[worst] ? d.status : worst),
    'ok',
  );

  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-20 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" /> YummyTime<span className="hidden sm:inline"> Command Center</span>
          </p>
          <h1 className="text-lg font-semibold leading-tight sm:text-xl">{location.name}</h1>
        </div>

        <nav className="order-last flex w-full gap-1 rounded-lg bg-zinc-100 p-1 text-sm font-medium sm:order-none sm:w-auto dark:bg-zinc-900">
          {PAGES.map((p) => (
            <a
              key={p}
              href={p === 'dashboard' ? '#/' : `#/${p}`}
              className={`flex-1 rounded-md px-2 py-1.5 text-center capitalize sm:flex-none sm:px-3 ${
                page === p ? 'bg-white shadow-sm dark:bg-zinc-800' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              {p}
            </a>
          ))}
        </nav>

        <button
          onClick={onToggleArmed}
          className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition sm:px-4 ${
            location.armed
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
          }`}
          title={location.armedBy ? `Last changed by ${location.armedBy}` : undefined}
        >
          {location.armed ? <Shield size={16} /> : <ShieldOff size={16} />}
          {location.armed ? 'Armed' : 'Disarmed'}
        </button>

        <button
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-2 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          Health: <StatusPill status={overall} />
        </span>
        <span>{devices.length} devices</span>
        <span className="text-emerald-600 dark:text-emerald-400">{counts.ok} OK</span>
        {counts.warning > 0 && <span className="text-amber-600 dark:text-amber-400">{counts.warning} warning</span>}
        {counts.critical > 0 && <span className="text-red-600 dark:text-red-400">{counts.critical} critical</span>}
        {counts.offline > 0 && <span>{counts.offline} offline</span>}
        <span className={`ml-auto flex items-center gap-1 ${connected ? '' : 'text-red-500'}`}>
          {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
          {connected ? 'Live' : 'Reconnecting…'}
        </span>
      </div>
    </header>
  );
}
