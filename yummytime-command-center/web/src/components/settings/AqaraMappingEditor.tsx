import { useState } from 'react';
import { api } from '../../api';
import type { AqaraResource, Device } from '../../types';
import { Btn, Field, Segmented, inputCls } from './fields';

export interface AqaraMapping {
  valueRes?: string;
  valueScale?: number;
  stateRes?: string;
  alarmValue?: string;
  batteryRes?: string;
  batteryMode?: 'percent' | 'mv';
}

/** Which Aqara resource holds the value, the state and the battery — detected on import, fixable here. */
export function AqaraMappingEditor({ device, value, onChange }: { device: Device; value: AqaraMapping; onChange: (m: AqaraMapping) => void }) {
  const [rows, setRows] = useState<AqaraResource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof AqaraMapping, v: unknown) => onChange({ ...value, [k]: v });
  const stateLabel = { smoke: 'Smoke alarm resource', door: 'Open/closed resource', vibration: 'Vibration resource' }[device.kind] ?? 'State resource';
  const alarmLabel = { smoke: 'Value meaning smoke', door: 'Value meaning open', vibration: 'Only this value (blank = any)' }[device.kind] ?? 'Alarm value';

  return (
    <div className="space-y-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Aqara resources <span className="font-normal normal-case">· {String(device.settings.model ?? '')}</span>
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {device.kind === 'temperature' ? (
          <>
            <Field label="Temperature resource">
              <input value={value.valueRes ?? ''} onChange={(e) => set('valueRes', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Scale" hint="Aqara reports 0.01 °C">
              <input type="number" step="any" value={value.valueScale ?? 0.01} onChange={(e) => set('valueScale', Number(e.target.value))} className={inputCls} />
            </Field>
          </>
        ) : (
          <>
            <Field label={stateLabel}>
              <input value={value.stateRes ?? ''} onChange={(e) => set('stateRes', e.target.value)} className={inputCls} />
            </Field>
            <Field label={alarmLabel}>
              <input value={value.alarmValue ?? ''} onChange={(e) => set('alarmValue', e.target.value)} className={inputCls} />
            </Field>
          </>
        )}
        <Field label="Battery resource">
          <input value={value.batteryRes ?? ''} onChange={(e) => set('batteryRes', e.target.value)} className={inputCls} />
        </Field>
      </div>
      <Field label="Battery reported as" group>
        <Segmented
          value={value.batteryMode ?? 'percent'}
          onChange={(v) => set('batteryMode', v)}
          options={[
            { value: 'percent', label: 'Percent' },
            { value: 'mv', label: 'Millivolts' },
          ]}
        />
      </Field>
      <Btn onClick={() => api.aqaraResources(device.id).then(setRows, (e) => setError(e.message))}>Show live values</Btn>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm tabular-nums">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="py-1 pr-3 font-medium">Resource</th>
                <th className="py-1 pr-3 font-medium">Name</th>
                <th className="py-1 pr-3 font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.resourceId} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="py-1 pr-3 font-mono">{r.resourceId}</td>
                  <td className="py-1 pr-3">{r.name}</td>
                  <td className="py-1 pr-3 font-mono">{r.value ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
