import { useState } from 'react';
import { api } from '../../api';
import type { Category, DeviceMeta } from '../../types';
import { Btn, Field, inputCls } from './fields';

export const KIND_LABEL: Record<string, string> = {
  camera: 'Camera',
  temperature: 'Temperature',
  smoke: 'Smoke detector',
  door: 'Door / contact',
  vibration: 'Vibration',
  hub: 'Hub',
};

export function AddDeviceForm({ category, meta, onDone, onCancel }: { category: Category; meta: DeviceMeta; onDone: (msg: string) => void; onCancel: () => void }) {
  const kinds = meta.kinds[category];
  const [kind, setKind] = useState(kinds[0]);
  const [name, setName] = useState('');
  const [externalId, setExternalId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const d = await api.addDevice({ category, kind, name, externalId: externalId.trim() || undefined });
      onDone(`${d.name} added`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-orange-300 bg-orange-50/50 p-4 dark:border-orange-500/30 dark:bg-orange-500/5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name">
          <input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kjøleskap 3" className={inputCls} />
        </Field>
        {kinds.length > 1 && (
          <Field label="Type">
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k] ?? k}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Device ID (optional)" hint={category === 'camera' ? 'IMOU deviceId — linked in step 4' : 'Aqara did — linked in step 5'}>
          <input value={externalId} onChange={(e) => setExternalId(e.target.value)} className={inputCls} />
        </Field>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Btn type="submit" variant="primary">Add</Btn>
        <Btn onClick={onCancel}>Cancel</Btn>
      </div>
    </form>
  );
}
