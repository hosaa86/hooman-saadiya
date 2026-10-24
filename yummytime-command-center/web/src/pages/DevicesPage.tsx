import { ChevronDown, ChevronUp, Plus, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Category, Device, DeviceMeta } from '../types';
import { Section, STATUS_DOT, temp } from '../components/ui';
import { DeviceEditor } from '../components/settings/DeviceEditor';
import { AddDeviceForm, KIND_LABEL } from '../components/settings/AddDeviceForm';
import { ScheduleCard } from '../components/settings/ScheduleCard';
import { AqaraCard } from '../components/settings/AqaraCard';

const SECTIONS: { category: Category; title: string }[] = [
  { category: 'camera', title: 'Cameras' },
  { category: 'sensor', title: 'Sensors' },
  { category: 'detector', title: 'Detectors' },
  { category: 'hub', title: 'Hub' },
];

export function DevicesPage({ devices, flash }: { devices: Device[]; flash: (msg: string) => void }) {
  const [meta, setMeta] = useState<DeviceMeta | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [adding, setAdding] = useState<Category | null>(null);

  useEffect(() => {
    api.meta().then(setMeta).catch(() => flash('Could not load device options'));
  }, [flash]);

  if (!meta) return null;

  const linked = devices.filter((d) => d.category === 'sensor' || d.category === 'detector').length;
  const done = (msg: string) => {
    flash(msg);
    setOpen(null);
    setAdding(null);
  };

  const move = (list: Device[], i: number, dir: -1 | 1) => {
    const ids = list.map((d) => d.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    api.reorder(ids).catch((e) => flash(e.message));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4">
      <div>
        <h2 className="text-xl font-semibold">Devices & settings</h2>
        <p className="text-sm text-zinc-500">Add, rename, reorder and configure the cards on the dashboard. Changes apply immediately.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ScheduleCard onDone={flash} />
        <AqaraCard flash={flash} />
      </div>

      {SECTIONS.map(({ category, title }) => {
        const list = devices.filter((d) => d.category === category).sort((a, b) => a.sortOrder - b.sortOrder);
        return (
          <Section
            key={category}
            title={title}
            count={list.length}
            action={
              adding !== category && (
                <span className="flex items-center gap-4">
                  {category === 'camera' && (
                    <button
                      onClick={() =>
                        api
                          .imouSync()
                          .then((r) => flash(`IMOU: ${r.found} cameras found, ${r.added.length} added`))
                          .catch((e) => flash(e.message))
                      }
                      className="flex items-center gap-1 text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-300"
                    >
                      <RefreshCw size={14} /> Sync IMOU
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setAdding(category);
                      setOpen(null);
                    }}
                    className="flex items-center gap-1 text-sm font-medium text-orange-600 hover:underline dark:text-orange-400"
                  >
                    <Plus size={16} /> Add
                  </button>
                </span>
              )
            }
          >
            <div className="space-y-2">
              {adding === category && <AddDeviceForm category={category} meta={meta} onDone={done} onCancel={() => setAdding(null)} />}
              {list.length === 0 && adding !== category && <p className="text-sm text-zinc-500">No devices.</p>}
              {list.map((d, i) => (
                <div key={d.id} className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-center gap-2 px-2 py-2">
                    <div className="flex flex-col">
                      <button aria-label="Move up" disabled={i === 0} onClick={() => move(list, i, -1)} className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 disabled:opacity-25 dark:hover:bg-zinc-800">
                        <ChevronUp size={16} />
                      </button>
                      <button aria-label="Move down" disabled={i === list.length - 1} onClick={() => move(list, i, 1)} className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 disabled:opacity-25 dark:hover:bg-zinc-800">
                        <ChevronDown size={16} />
                      </button>
                    </div>
                    <button onClick={() => setOpen(open === d.id ? null : d.id)} className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[d.status]}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{d.name}</span>
                        <span className="block text-xs text-zinc-500">
                          {KIND_LABEL[d.kind] ?? d.kind} · {d.provider === 'mock' ? 'mock' : d.provider.toUpperCase()}
                          {d.kind === 'temperature' && ` · ${temp(d.settings.min)} to ${temp(d.settings.max)} °C · every ${d.settings.logIntervalMin} min`}
                          {d.category === 'camera' && ` · rec: ${String(d.settings.recordingMode).replace('_', ' ')}`}
                        </span>
                      </span>
                      <ChevronDown size={18} className={`shrink-0 text-zinc-400 transition ${open === d.id ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                  {open === d.id && <DeviceEditor key={d.id} device={d} meta={meta} linkedCount={linked} onDone={done} />}
                </div>
              ))}
            </div>
          </Section>
        );
      })}
    </div>
  );
}
