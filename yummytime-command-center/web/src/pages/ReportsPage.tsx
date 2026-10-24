import { CheckCircle2, FileSpreadsheet, FileText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, DEMO } from '../api';
import type { Deviation, ReportSensor, SensorSummary } from '../types';
import { Btn, Field, Segmented, inputCls } from '../components/settings/fields';
import { temp } from '../components/ui';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' }).format(new Date());
const daysAgo = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' }).format(new Date(Date.now() - n * 864e5));
const when = (iso: string) => new Date(iso).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' });
const deg = (n: number | null) => (n == null ? '–' : `${temp(n, 1)} °C`);

const PRESETS = [
  { label: '7 days', from: () => daysAgo(6) },
  { label: '30 days', from: () => daysAgo(29) },
  { label: 'This month', from: () => today().slice(0, 8) + '01' },
];

export function ReportsPage({ flash }: { flash: (msg: string) => void }) {
  const [sensors, setSensors] = useState<ReportSensor[]>([]);
  const [selected, setSelected] = useState<number[] | null>(null);
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(today());
  const [detail, setDetail] = useState<'daily' | 'all'>('daily');
  const [summary, setSummary] = useState<SensorSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.reportSensors().then((s) => {
      setSensors(s);
      setSelected(s.filter((x) => !x.archived).map((x) => x.id));
    }, (e) => setError(e.message));
  }, []);

  const query = useMemo(() => new URLSearchParams({ from, to, devices: (selected ?? []).join(',') }).toString(), [from, to, selected]);
  const reload = () => {
    if (!selected?.length) return setSummary([]);
    api.reportSummary(query).then((s) => (setSummary(s), setError(null)), (e) => setError(e.message));
  };
  useEffect(reload, [query]);

  const toggle = (id: number) => setSelected((s) => (s?.includes(id) ? s.filter((x) => x !== id) : [...(s ?? []), id]));
  const ready = !!selected?.length && from <= to;
  const deviations = summary.flatMap((s) => s.deviations).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const unsigned = deviations.filter((d) => !d.signedBy).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <div>
        <h2 className="text-xl font-semibold">Temperature reports</h2>
        <p className="text-sm text-zinc-500">Temperature log and deviations (avvik) for Mattilsynet. Pick sensors and a period, then download.</p>
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <Field label="Sensors" group>
          <div className="flex flex-wrap gap-2">
            {sensors.map((s) => {
              const on = selected?.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  className={`rounded-full border px-3 py-1 text-sm ${on ? 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300' : 'border-zinc-300 text-zinc-500 dark:border-zinc-700'}`}
                >
                  {s.name}
                  {s.archived && <span className="ml-1 text-xs opacity-70">(removed)</span>}
                </button>
              );
            })}
          </div>
        </Field>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Field label="From">
              <input id="report-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <div className="w-40">
            <Field label="To">
              <input id="report-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <div className="flex gap-1">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => (setFrom(p.from()), setTo(today()))} className="rounded-lg px-2.5 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="max-w-sm">
          <Field label="PDF contents" group>
            <Segmented
              value={detail}
              onChange={setDetail}
              options={[
                { value: 'daily', label: 'Daily summary' },
                { value: 'all', label: 'Every reading' },
              ]}
            />
          </Field>
        </div>
        {DEMO ? (
          <p className="text-sm text-zinc-500">Downloads work in the local app (the demo has no stored log).</p>
        ) : (
          <div className={`flex flex-wrap gap-2 ${ready ? '' : 'pointer-events-none opacity-50'}`}>
            <a href={`/api/reports/temperature.pdf?${query}&detail=${detail}`} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600">
              <FileText size={16} /> Download PDF
            </a>
            <a href={`/api/reports/temperature.csv?${query}`} className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-2 text-sm font-semibold hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700">
              <FileSpreadsheet size={16} /> Readings (CSV)
            </a>
            <a href={`/api/reports/temperature.csv?${query}&kind=deviations`} className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-2 text-sm font-semibold hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700">
              <FileSpreadsheet size={16} /> Deviations (CSV)
            </a>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {summary.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[560px] text-left text-sm tabular-nums">
            <thead className="text-xs text-zinc-500">
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="px-4 py-2 font-medium">Sensor</th>
                <th className="px-3 py-2 font-medium">Limits</th>
                <th className="px-3 py-2 text-right font-medium">Readings</th>
                <th className="px-3 py-2 text-right font-medium">Lowest</th>
                <th className="px-3 py-2 text-right font-medium">Highest</th>
                <th className="px-3 py-2 text-right font-medium">Within limits</th>
                <th className="px-4 py-2 text-right font-medium">Deviations</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.device.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="px-4 py-2 font-medium">{s.device.name}</td>
                  <td className="px-3 py-2 text-zinc-500">
                    {temp(Number(s.device.settings.min))} to {temp(Number(s.device.settings.max))} °C
                  </td>
                  <td className="px-3 py-2 text-right">{s.count}</td>
                  <td className="px-3 py-2 text-right">{deg(s.min)}</td>
                  <td className="px-3 py-2 text-right">{deg(s.max)}</td>
                  <td className={`px-3 py-2 text-right ${s.inRangePct != null && s.inRangePct < 100 ? 'text-amber-600 dark:text-amber-400' : ''}`}>{s.inRangePct == null ? '–' : `${String(s.inRangePct).replace('.', ',')} %`}</td>
                  <td className={`px-4 py-2 text-right ${s.deviations.length ? 'font-semibold text-red-600 dark:text-red-400' : ''}`}>{s.deviations.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline gap-2">
          <h3 className="font-semibold">Deviations (avvik)</h3>
          <span className="text-sm text-zinc-500">{deviations.length === 0 ? 'none in this period' : unsigned ? `${unsigned} not signed` : 'all signed'}</span>
        </div>
        {deviations.map((d) => (
          <DeviationRow key={d.id} d={d} onSaved={() => (flash('Deviation signed'), reload())} />
        ))}
      </section>
    </div>
  );
}

function DeviationRow({ d, onSaved }: { d: Deviation; onSaved: () => void }) {
  const [action, setAction] = useState(d.correctiveAction ?? '');
  const [by, setBy] = useState(d.signedBy ?? '');
  const [open, setOpen] = useState(!d.signedBy);
  const [error, setError] = useState<string | null>(null);
  const high = d.peakValueC != null && d.maxLimit != null && d.peakValueC > d.maxLimit;

  const save = async () => {
    try {
      await api.signDeviation(d.id, action, by);
      setError(null);
      setOpen(false);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className={`rounded-xl border bg-white p-4 dark:bg-zinc-900 ${d.signedBy ? 'border-zinc-200 dark:border-zinc-800' : 'border-amber-300 dark:border-amber-500/40'}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">{d.deviceName}</span>
        <span className={`text-sm font-semibold tabular-nums ${d.severity === 'critical' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
          {high ? 'peak' : 'lowest'} {deg(d.peakValueC)}
        </span>
        <span className="text-sm text-zinc-500 tabular-nums">
          {when(d.startedAt)} – {d.endedAt ? when(d.endedAt) : 'ongoing'} · limit {temp(d.minLimit ?? 0)} to {temp(d.maxLimit ?? 0)} °C
        </span>
        {d.signedBy && !open && (
          <button onClick={() => setOpen(true)} className="ml-auto text-sm text-zinc-500 hover:underline">
            Edit
          </button>
        )}
      </div>
      {d.signedBy && !open ? (
        <p className="mt-2 flex gap-2 text-sm">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
          <span>
            {d.correctiveAction} <span className="text-zinc-500">— {d.signedBy}, {when(d.signedAt!)}</span>
          </span>
        </p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_12rem_auto]">
          <Field label="Corrective action (tiltak)">
            <input id={`dev-action-${d.id}`} value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. Door left open — closed, goods checked at 3.8 °C" className={inputCls} />
          </Field>
          <Field label="Signed by">
            <input id={`dev-by-${d.id}`} value={by} onChange={(e) => setBy(e.target.value)} className={inputCls} />
          </Field>
          <div className="flex items-end">
            <Btn variant="primary" onClick={save}>
              Sign
            </Btn>
          </div>
          {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
        </div>
      )}
    </div>
  );
}
