import { FlaskConical } from 'lucide-react';
import { api } from '../api';

const BUTTONS = [
  { name: 'smoke', label: 'Smoke' },
  { name: 'intrusion', label: 'Night intrusion' },
  { name: 'temperature', label: 'Fridge too warm' },
  { name: 'reset', label: 'Reset all' },
] as const;

/** Only shown in MOCK_MODE: fire test scenarios to review alarm states. */
export function DemoPanel() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
        <FlaskConical size={14} /> Mock mode · simulate
      </p>
      <div className="flex flex-wrap gap-2">
        {BUTTONS.map((b) => (
          <button
            key={b.name}
            onClick={() => api.scenario(b.name)}
            className="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
