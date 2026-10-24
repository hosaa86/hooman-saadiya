import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useDashboard } from './useDashboard';
import { useTheme } from './useTheme';
import { useNow } from './useNow';
import type { Alert } from './types';
import { Header } from './components/Header';
import { AlarmBanner } from './components/AlarmBanner';
import { CameraTile } from './components/CameraTile';
import { HubCard, SensorCard } from './components/SensorCard';
import { DetectorCard } from './components/DetectorCard';
import { EventFeed } from './components/EventFeed';
import { LiveViewModal } from './components/LiveViewModal';
import { DemoPanel } from './components/DemoPanel';
import { Section } from './components/ui';
import { DevicesPage } from './pages/DevicesPage';
import { AlertsPage } from './pages/AlertsPage';
import { ReportsPage } from './pages/ReportsPage';
import { CallBackSheet } from './components/CallBackSheet';
import { PAGES, type Page } from './components/Header';

const pageFromHash = (): Page => PAGES.find((p) => location.hash.startsWith(`#/${p}`)) ?? 'dashboard';

export default function App() {
  const { theme, toggle } = useTheme();
  const [liveView, setLiveView] = useState<number[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [page, setPage] = useState<Page>(pageFromHash);
  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);
  const [callBack, setCallBack] = useState<Alert | null>(null);
  const { data, connected, history } = useDashboard(setLiveView);

  // #/live (the link in alarm messages) opens live view of every online camera
  useEffect(() => {
    if (!data || !location.hash.startsWith('#/live')) return;
    setLiveView(data.devices.filter((d) => d.category === 'camera' && d.online).map((d) => d.id));
    window.history.replaceState(null, '', '#/');
  }, [data !== null]);
  useNow(15_000); // refresh "x min ago" labels

  const groups = useMemo(() => {
    const d = data?.devices ?? [];
    const by = (c: string) => d.filter((x) => x.category === c).sort((a, b) => a.sortOrder - b.sortOrder);
    return { cameras: by('camera'), sensors: by('sensor'), detectors: by('detector'), hubs: by('hub') };
  }, [data?.devices]);

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-zinc-500 dark:bg-zinc-950">
        Connecting to local server…
      </div>
    );
  }

  const onlineCams = groups.cameras.filter((c) => c.online).map((c) => c.id);
  const onCallBack = (a: Alert) => setCallBack(a);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <Header
        location={data.location}
        devices={data.devices}
        connected={connected}
        theme={theme}
        onToggleTheme={toggle}
        onToggleArmed={() => api.setArmed(!data.location.armed)}
        page={page}
      />

      {page === 'devices' ? (
        <DevicesPage devices={data.devices} flash={flash} />
      ) : page === 'alerts' ? (
        <AlertsPage alerts={data.alerts} flash={flash} />
      ) : page === 'reports' ? (
        <ReportsPage flash={flash} />
      ) : (
        <main className="mx-auto grid max-w-7xl gap-6 p-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            <AlarmBanner alerts={data.alerts} onLiveView={() => setLiveView(onlineCams)} onAck={(id) => api.ack(id)} onCallBack={onCallBack} />

            <Section
              title="Cameras"
              count={groups.cameras.length}
              action={
                <button onClick={() => setLiveView(onlineCams)} className="text-sm font-medium text-orange-600 hover:underline dark:text-orange-400">
                  View all live
                </button>
              }
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                {groups.cameras.map((c) => (
                  <CameraTile key={c.id} camera={c} onOpen={() => setLiveView([c.id])} />
                ))}
              </div>
            </Section>

            <Section title="Sensors & Hub" count={groups.sensors.length + groups.hubs.length}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {groups.sensors.map((s) => (
                  <SensorCard key={s.id} sensor={s} history={history[s.id] ?? []} />
                ))}
                {groups.hubs.map((h) => (
                  <HubCard key={h.id} hub={h} deviceCount={groups.sensors.length + groups.detectors.length} />
                ))}
              </div>
            </Section>

            <Section title="Detectors" count={groups.detectors.length}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {groups.detectors.map((d) => (
                  <DetectorCard key={d.id} detector={d} locationArmed={data.location.armed} />
                ))}
              </div>
            </Section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
            {data.mockMode && <DemoPanel />}
            <Section title="Live events" count={data.events.length}>
              <div className="lg:max-h-[calc(100vh-16rem)] lg:overflow-auto lg:rounded-xl">
                <EventFeed events={data.events} />
              </div>
            </Section>
          </aside>
        </main>
      )}

      {liveView && (
        <LiveViewModal cameras={data.devices.filter((d) => liveView.includes(d.id))} onClose={() => setLiveView(null)} flash={flash} />
      )}

      {callBack && <CallBackSheet alert={callBack} onClose={() => setCallBack(null)} />}

      {toast && (
        <div className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-md rounded-xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
          {toast}
        </div>
      )}
    </div>
  );
}
