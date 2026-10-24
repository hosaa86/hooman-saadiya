import { BatteryLow, BatteryMedium, Router } from 'lucide-react';
import type { Device } from '../types';
import { Sparkline } from './Sparkline';
import { Card, STATUS_TEXT, StatusPill, temp, timeAgo } from './ui';

export function Battery({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const low = pct < 20;
  return (
    <span className={`flex items-center gap-1 text-xs ${low ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-zinc-500'}`}>
      {low ? <BatteryLow size={14} /> : <BatteryMedium size={14} />} {pct}%
    </span>
  );
}

export function SensorCard({ sensor, history }: { sensor: Device; history: number[] }) {
  const { min, max } = sensor.settings as { min: number; max: number };
  const show = (f: string) => sensor.visibleFields.includes(f);

  return (
    <Card status={sensor.status}>
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-sm font-medium">{sensor.name}</span>
        <StatusPill status={sensor.status} />
      </div>
      {show('value') && (
        <div className="mt-1 flex items-end justify-between gap-3">
          <p className={`text-3xl font-semibold tabular-nums ${sensor.status === 'ok' ? '' : STATUS_TEXT[sensor.status]}`}>
            {sensor.online && sensor.lastValue != null ? temp(sensor.lastValue, 1) : '—'}
            <span className="ml-0.5 text-base font-normal text-zinc-400">°C</span>
          </p>
          <Sparkline values={history} min={min} max={max} className={`mb-1.5 h-7 w-24 ${STATUS_TEXT[sensor.status]}`} />
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-zinc-500">
        {show('limits') && <span>Limit {temp(min)} to {temp(max)} °C</span>}
        <span className="flex items-center gap-3">
          {show('battery') && <Battery pct={sensor.battery} />}
          {show('lastSeen') && <span>{timeAgo(sensor.lastSeen)}</span>}
        </span>
      </div>
    </Card>
  );
}

export function HubCard({ hub, deviceCount }: { hub: Device; deviceCount: number }) {
  const show = (f: string) => hub.visibleFields.includes(f);
  return (
    <Card status={hub.status}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-2 truncate text-sm font-medium">
          <Router size={16} className="text-zinc-400" /> {hub.name}
        </span>
        <StatusPill status={hub.status} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-500">
        {show('connection') && (
          <div>
            <p>Connection</p>
            <p className="text-sm font-medium capitalize text-zinc-900 dark:text-zinc-100">{hub.online ? hub.lastState ?? 'connected' : 'disconnected'}</p>
          </div>
        )}
        {show('linked') && (
          <div>
            <p>Linked devices</p>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{hub.lastValue ?? deviceCount}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
