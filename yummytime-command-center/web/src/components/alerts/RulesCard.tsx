import { ChevronDown, Plus, Trash2, Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { Rule } from '../../types';
import { Btn, Field, Segmented, Toggle, inputCls } from '../settings/fields';

export const TRIGGER_LABEL: Record<string, string> = {
  smoke: 'Smoke',
  door_open: 'Door opened',
  vibration: 'Vibration',
  temp_out_of_range: 'Temperature out of range',
  offline: 'Device offline',
  low_battery: 'Low battery',
};

type Draft = Omit<Rule, 'id' | 'sortOrder'> & { id?: number };
const blank: Draft = { name: '', enabled: true, events: [], armedOnly: false, recordCameras: false, openLiveView: false, alertSeverity: 'warning', escalateToCritical: false };

function summary(r: Rule) {
  const parts = [r.events.map((e) => TRIGGER_LABEL[e] ?? e).join(' or ')];
  if (r.armedOnly) parts.push('while armed');
  const then = [r.recordCameras && 'record cameras', r.openLiveView && 'open live view', r.alertSeverity === 'critical' ? 'call + WhatsApp' : r.alertSeverity === 'warning' ? 'WhatsApp' : null].filter(Boolean);
  return `${parts.join(' ')} → ${then.join(', ') || 'log only'}`;
}

export function RulesCard({ flash }: { flash: (msg: string) => void }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [triggers, setTriggers] = useState<string[]>([]);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = () =>
    api.rules().then((r) => {
      setRules(r.rules);
      setTriggers(r.triggers);
    });
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const save = async (d: Draft, msg = `Saved rule "${d.name}"`) => {
    try {
      await api.saveRule(d);
      flash(msg);
      setEdit(null);
      setError(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async () => {
    if (!edit?.id) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    await api.deleteRule(edit.id);
    flash(`Deleted rule "${edit.name}"`);
    setEdit(null);
    load();
  };

  const form = edit && (
    <div className="space-y-4 border-t border-zinc-200 p-4 dark:border-zinc-800">
      <Field label="Rule name">
        <input id="rule-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={inputCls} />
      </Field>
      <Field label="When" group>
        <div className="flex flex-wrap gap-2">
          {triggers.map((t) => {
            const on = edit.events.includes(t);
            return (
              <button
                type="button"
                key={t}
                onClick={() => setEdit({ ...edit, events: on ? edit.events.filter((x) => x !== t) : [...edit.events, t] })}
                className={`rounded-full border px-3 py-1 text-sm ${on ? 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300' : 'border-zinc-300 text-zinc-500 dark:border-zinc-700'}`}
              >
                {TRIGGER_LABEL[t] ?? t}
              </button>
            );
          })}
        </div>
      </Field>
      <Toggle label="Only while armed (night mode)" checked={edit.armedOnly} onChange={(v) => setEdit({ ...edit, armedOnly: v })} />
      <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Then</p>
        <Toggle label="Record all cameras" checked={edit.recordCameras} onChange={(v) => setEdit({ ...edit, recordCameras: v })} />
        <Toggle label="Open live view on dashboards" checked={edit.openLiveView} onChange={(v) => setEdit({ ...edit, openLiveView: v })} />
        <div className="mt-2">
          <Field label="Alert" group>
            <Segmented
              value={edit.alertSeverity}
              onChange={(v) => setEdit({ ...edit, alertSeverity: v })}
              options={[
                { value: 'none', label: 'None' },
                { value: 'warning', label: 'Warning (WhatsApp)' },
                { value: 'critical', label: 'Critical (call)' },
              ]}
            />
          </Field>
        </div>
        {edit.events.includes('temp_out_of_range') && (
          <div className="mt-2">
            <Toggle label="Escalate to critical (call) when a sensor reaches its critical time" checked={edit.escalateToCritical} onChange={(v) => setEdit({ ...edit, escalateToCritical: v })} />
          </div>
        )}
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Btn variant="primary" onClick={() => save(edit)}>
          Save rule
        </Btn>
        <Btn onClick={() => (setEdit(null), setError(null))}>Cancel</Btn>
        <span className="flex-1" />
        {edit.id && (
          <Btn variant="danger" onClick={remove}>
            <Trash2 size={16} /> {confirmDelete ? 'Tap again to delete' : 'Delete'}
          </Btn>
        )}
      </div>
    </div>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2 px-4 py-3">
        <Workflow size={18} className="text-indigo-500" />
        <h3 className="flex-1 font-semibold">Automations</h3>
        {!edit && (
          <button onClick={() => setEdit({ ...blank })} className="flex items-center gap-1 text-sm font-medium text-orange-600 hover:underline dark:text-orange-400">
            <Plus size={16} /> Add rule
          </button>
        )}
      </div>
      <ul>
        {rules.map((r) => (
          <li key={r.id} className="border-t border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-3 px-4 py-2.5">
              <button onClick={() => setEdit(edit?.id === r.id ? null : { ...r })} className="min-w-0 flex-1 text-left">
                <span className={`block font-medium ${r.enabled ? '' : 'text-zinc-400 line-through'}`}>{r.name}</span>
                <span className="block text-xs text-zinc-500">{summary(r)}</span>
              </button>
              <button
                role="switch"
                aria-checked={r.enabled}
                aria-label={`${r.enabled ? 'Disable' : 'Enable'} ${r.name}`}
                onClick={() => save({ ...r, enabled: !r.enabled }, `${r.name} ${r.enabled ? 'off' : 'on'}`)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${r.enabled ? 'bg-orange-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${r.enabled ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
              <ChevronDown size={18} className={`shrink-0 text-zinc-400 transition ${edit?.id === r.id ? 'rotate-180' : ''}`} />
            </div>
            {edit?.id === r.id && form}
          </li>
        ))}
      </ul>
      {edit && !edit.id && form}
    </div>
  );
}
