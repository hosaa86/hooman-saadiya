import { Activity, DoorClosed, DoorOpen, Flame, Shield, ShieldOff } from 'lucide-react';
import type { Device } from '../types';
import { Battery } from './SensorCard';
import { Card, STATUS_TEXT, StatusPill } from './ui';

const STATE_LABEL: Record<string, string> = {
  clear: 'Clear',
  smoke: 'SMOKE',
  closed: 'Closed',
  open: 'OPEN',
  still: 'No vibration',
  vibration: 'VIBRATION',
};

function Icon({ d }: { d: Device }) {
  const cls = 'shrink-0';
  if (d.kind === 'smoke') return <Flame size={20} className={cls} />;
  if (d.kind === 'door') return d.lastState === 'open' ? <DoorOpen size={20} className={cls} /> : <DoorClosed size={20} className={cls} />;
  return <Activity size={20} className={cls} />;
}

export function DetectorCard({ detector, locationArmed }: { detector: Device; locationArmed: boolean }) {
  const show = (f: string) => detector.visibleFields.includes(f);
  // Smoke detectors are always active; door/vibration follow the location's armed state
  const alwaysOn = detector.kind === 'smoke';
  const armed = alwaysOn || (locationArmed && detector.settings.armedSchedule !== false);
  const alarm = detector.lastState === 'smoke' || detector.lastState === 'open' || detector.lastState === 'vibration';

  return (
    <Card status={detector.status}>
      <div className="flex items-start justify-between gap-2">
        <span className={`flex min-w-0 items-center gap-2 ${alarm ? STATUS_TEXT[detector.status] : 'text-zinc-400'}`}>
          <Icon d={detector} />
          <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{detector.name}</span>
        </span>
        <StatusPill status={detector.status} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {show('state') && (
          <span className={`text-lg font-semibold ${alarm ? STATUS_TEXT[detector.status] : ''}`}>
            {detector.online ? STATE_LABEL[detector.lastState ?? ''] ?? detector.lastState ?? '—' : '—'}
          </span>
        )}
        <span className="flex items-center gap-3">
          {show('armed') && (
            <span className={`flex items-center gap-1 text-xs ${armed ? 'font-medium text-red-600 dark:text-red-400' : 'text-zinc-500'}`}>
              {armed ? <Shield size={14} /> : <ShieldOff size={14} />}
              {alwaysOn ? 'Always on' : armed ? 'Armed' : 'Disarmed'}
            </span>
          )}
          {show('battery') && <Battery pct={detector.battery} />}
        </span>
      </div>
    </Card>
  );
}
