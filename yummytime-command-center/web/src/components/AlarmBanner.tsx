import { AlertTriangle, Check, Phone, Siren, Video } from 'lucide-react';
import type { Alert } from '../types';
import { clock } from './ui';

interface Props {
  alerts: Alert[];
  onLiveView: () => void;
  onAck: (id: number) => void;
  onCallBack: (a: Alert) => void;
}

export function AlarmBanner({ alerts, onLiveView, onAck, onCallBack }: Props) {
  if (alerts.length === 0) return null;
  const critical = alerts.filter((a) => a.severity === 'critical');
  const warnings = alerts.filter((a) => a.severity === 'warning');

  return (
    <div className="space-y-2">
      {critical.map((a) => (
        <div key={a.id} role="alert" className="rounded-xl bg-red-600 p-4 text-white shadow-lg shadow-red-600/30 ring-4 ring-red-600/25">
          <div className="flex items-start gap-3">
            <Siren className="mt-0.5 shrink-0 animate-pulse" size={24} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-red-100">Critical alarm · {clock(a.createdAt)}</p>
              <p className="text-lg font-bold leading-tight">{a.title}</p>
              <p className="text-sm text-red-100">{a.message}</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <BannerButton onClick={onLiveView} icon={<Video size={16} />} label="Live view" />
            <BannerButton onClick={() => onAck(a.id)} icon={<Check size={16} />} label="Acknowledge" primary />
            <BannerButton onClick={() => onCallBack(a)} icon={<Phone size={16} />} label="Call back" />
          </div>
        </div>
      ))}

      {warnings.map((a) => (
        <div key={a.id} className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="shrink-0" size={20} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight">{a.title}</p>
            <p className="text-xs opacity-80">{a.message} · {clock(a.createdAt)}</p>
          </div>
          <button
            onClick={() => onAck(a.id)}
            className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600"
          >
            Acknowledge
          </button>
        </div>
      ))}
    </div>
  );
}

function BannerButton({ onClick, icon, label, primary }: { onClick: () => void; icon: React.ReactNode; label: string; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-xs font-semibold transition sm:flex-row sm:gap-1.5 sm:px-2 sm:py-2.5 sm:text-sm ${
        primary ? 'bg-white text-red-700 hover:bg-red-50' : 'bg-red-700/60 text-white hover:bg-red-800'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
