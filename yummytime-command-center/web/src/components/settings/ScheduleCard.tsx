import { Moon, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { Schedule } from '../../types';
import { Btn, Field, Toggle, inputCls } from './fields';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function ScheduleCard({ onDone }: { onDone: (msg: string) => void }) {
  const [s, setS] = useState<Schedule | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.schedule().then(setS).catch((e) => setError(e.message));
  }, []);

  if (!s) return null;

  const save = async () => {
    try {
      setS(await api.setSchedule(s));
      setError(null);
      onDone('Night mode schedule saved');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <Moon size={18} className="text-indigo-500" />
        <h3 className="flex-1 font-semibold">Night mode (auto arm / disarm)</h3>
      </div>
      <Toggle label="Arm automatically by schedule" checked={s.enabled} onChange={(enabled) => setS({ ...s, enabled })} />
      <div className={`space-y-4 ${s.enabled ? '' : 'pointer-events-none opacity-50'}`}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Arm at">
            <input type="time" value={s.armTime} onChange={(e) => setS({ ...s, armTime: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Disarm at">
            <input type="time" value={s.disarmTime} onChange={(e) => setS({ ...s, disarmTime: e.target.value })} className={inputCls} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d, i) => {
            const day = i + 1;
            const on = s.days.includes(day);
            return (
              <button
                type="button"
                key={d}
                onClick={() => setS({ ...s, days: on ? s.days.filter((x) => x !== day) : [...s.days, day] })}
                className={`h-9 w-12 rounded-lg text-sm font-medium ${on ? 'bg-indigo-500 text-white' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'}`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Btn variant="primary" onClick={save}>
        <Save size={16} /> Save schedule
      </Btn>
    </div>
  );
}
