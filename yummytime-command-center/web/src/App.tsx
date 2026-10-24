import { useEffect, useState } from 'react';
import { useTheme } from './useTheme';

type Health = {
  ok: boolean;
  mockMode: boolean;
  location: { id: number; name: string; armed: number } | null;
  deviceCount: number;
  integrations: Record<string, boolean>;
};

export default function App() {
  const { theme, toggle } = useTheme();
  const [health, setHealth] = useState<Health | null>(null);
  const [wsState, setWsState] = useState<'connecting' | 'open' | 'closed'>('connecting');

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));

    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => setWsState('open');
    ws.onclose = () => setWsState('closed');
    return () => ws.close();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">YummyTime Command Center</p>
          <h1 className="text-lg font-semibold">{health?.location?.name ?? 'Yummy Time Capsule'}</h1>
        </div>
        <button
          onClick={toggle}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </header>

      <main className="mx-auto max-w-3xl space-y-3 p-4">
        <p className="text-sm text-zinc-500">Step 1 scaffold — dashboard UI arrives in step 2.</p>
        <Row label="Backend API" ok={!!health?.ok} />
        <Row label="WebSocket" ok={wsState === 'open'} detail={wsState} />
        <Row label="Mock mode" ok={!!health?.mockMode} detail={health?.mockMode ? 'on' : 'off'} />
        {health &&
          Object.entries(health.integrations).map(([k, v]) => (
            <Row key={k} label={`${k} credentials`} ok={v} detail={v ? 'set' : 'missing in .env'} />
          ))}
      </main>
    </div>
  );
}

function Row({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-2 text-sm text-zinc-500">
        {detail}
        <span className={`h-2.5 w-2.5 rounded-full ${ok ? 'bg-green-500' : 'bg-zinc-400'}`} />
      </span>
    </div>
  );
}
