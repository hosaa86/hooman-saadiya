import { Save, Trash2, Zap } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api';
import type { Device, DeviceMeta } from '../../types';
import { Btn, Field, NumberInput, Segmented, Toggle, inputCls } from './fields';

interface Props {
  device: Device;
  meta: DeviceMeta;
  linkedCount: number;
  onDone: (msg: string) => void;
}

export function DeviceEditor({ device, meta, linkedCount, onDone }: Props) {
  const [name, setName] = useState(device.name);
  const [fields, setFields] = useState<string[]>(device.visibleFields);
  const [settings, setSettings] = useState<Record<string, any>>({
    // fill values missing on devices created by an older version
    ...(device.kind === 'temperature' ? { warnAfterMin: 15, criticalAfterMin: 45, criticalMargin: 2 } : {}),
    ...device.settings,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = (k: string, v: unknown) => setSettings((s) => ({ ...s, [k]: v }));
  const options = meta.fieldOptions[device.category];

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.updateDevice(device.id, { name, visibleFields: fields, settings });
      onDone(`Saved ${name}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    try {
      const { result } = await api.deleteDevice(device.id);
      onDone(result === 'archived' ? `${device.name} removed — its temperature log is kept for Mattilsynet` : `${device.name} removed`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const test = async () => {
    try {
      await api.testDetector(device.id);
      onDone(`Test sent to ${device.name} — watch the dashboard (no alert is sent)`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-5 border-t border-zinc-200 p-4 dark:border-zinc-800">
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
      </Field>

      {device.category === 'camera' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Recording mode" group>
            <Segmented
              value={settings.recordingMode}
              onChange={(v) => set('recordingMode', v)}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'on_event', label: 'On event' },
                { value: 'continuous', label: 'Continuous' },
              ]}
            />
          </Field>
          <Field label="Clip length" hint="Length of each saved MP4 clip">
            <NumberInput value={settings.clipSeconds} onChange={(v) => set('clipSeconds', v)} suffix="sec" />
          </Field>
        </div>
      )}

      {device.kind === 'temperature' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Min limit">
              <NumberInput value={settings.min} step={0.5} onChange={(v) => set('min', v)} suffix="°C" />
            </Field>
            <Field label="Max limit">
              <NumberInput value={settings.max} step={0.5} onChange={(v) => set('max', v)} suffix="°C" />
            </Field>
            <Field label="Logging interval" hint="Stored for Mattilsynet">
              <NumberInput value={settings.logIntervalMin} onChange={(v) => set('logIntervalMin', v)} suffix="min" />
            </Field>
          </div>
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Warning vs critical</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Warning after" hint="Out of range this long → message">
                <NumberInput value={settings.warnAfterMin} onChange={(v) => set('warnAfterMin', v)} suffix="min" />
              </Field>
              <Field label="Critical after" hint="Still out of range → phone call">
                <NumberInput value={settings.criticalAfterMin} onChange={(v) => set('criticalAfterMin', v)} suffix="min" />
              </Field>
              <Field label="Critical margin" hint="This far past the limit = critical at once">
                <NumberInput value={settings.criticalMargin} step={0.5} onChange={(v) => set('criticalMargin', v)} suffix="°C" />
              </Field>
            </div>
          </div>
        </div>
      )}

      {device.category === 'detector' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sensitivity" group>
            <Segmented
              value={settings.sensitivity}
              onChange={(v) => set('sensitivity', v)}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
              ]}
            />
          </Field>
          <div>
            {device.kind === 'smoke' ? (
              <p className="pt-5 text-sm text-zinc-500">Smoke detectors are always armed.</p>
            ) : (
              <Toggle label="Follow night mode schedule (armed at night)" checked={!!settings.armedSchedule} onChange={(v) => set('armedSchedule', v)} />
            )}
          </div>
        </div>
      )}

      {device.category === 'hub' && (
        <div className="grid grid-cols-2 gap-4 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-950">
          <div>
            <p className="text-xs text-zinc-500">Connection</p>
            <p className={`font-medium capitalize ${device.online ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'}`}>
              {device.online ? device.lastState ?? 'connected' : 'disconnected'}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Linked devices</p>
            <p className="font-medium">{device.lastValue ?? linkedCount}</p>
          </div>
        </div>
      )}

      <Field label="Show on card" group>
        <div className="flex flex-wrap gap-2">
          {Object.entries(options).map(([key, label]) => {
            const on = fields.includes(key);
            return (
              <button
                type="button"
                key={key}
                onClick={() => setFields((f) => (on ? f.filter((x) => x !== key) : [...f, key]))}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  on
                    ? 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300'
                    : 'border-zinc-300 text-zinc-500 line-through dark:border-zinc-700'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </Field>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Btn variant="primary" onClick={save} disabled={busy}>
          <Save size={16} /> Save
        </Btn>
        {device.category === 'detector' && (
          <Btn onClick={test}>
            <Zap size={16} /> Test
          </Btn>
        )}
        <span className="flex-1" />
        <Btn variant="danger" onClick={remove}>
          <Trash2 size={16} /> {confirmDelete ? 'Tap again to delete' : 'Delete'}
        </Btn>
      </div>
    </div>
  );
}
