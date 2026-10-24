import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { DashboardData, ServerMessage } from './types';

const HISTORY = 40;

/** Loads the dashboard once, then keeps it live from the WebSocket (auto-reconnects). */
export function useDashboard(onOpenLiveView: (ids: number[]) => void) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [connected, setConnected] = useState(false);
  const [history, setHistory] = useState<Record<number, number[]>>({});
  const liveViewRef = useRef(onOpenLiveView);
  liveViewRef.current = onOpenLiveView;

  const load = useCallback(() => api.dashboard().then(setData).catch(() => {}), []);

  useEffect(() => {
    let ws: WebSocket;
    let retry: number;
    let closed = false;

    const connect = () => {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      ws.onopen = () => {
        setConnected(true);
        load(); // resync after (re)connect
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = window.setTimeout(connect, 2000);
      };
      ws.onmessage = (e) => handle(JSON.parse(e.data) as ServerMessage);
    };

    const handle = (msg: ServerMessage) => {
      if (msg.type === 'open_live_view') return liveViewRef.current(msg.deviceIds);
      if (msg.type === 'device_update' && msg.device.lastValue != null && msg.device.kind === 'temperature') {
        const { id, lastValue } = msg.device;
        setHistory((h) => ({ ...h, [id]: [...(h[id] ?? []), lastValue].slice(-HISTORY) }));
      }
      setData((d) => {
        if (!d) return d;
        switch (msg.type) {
          case 'device_update':
            return { ...d, devices: d.devices.map((x) => (x.id === msg.device.id ? msg.device : x)) };
          case 'event':
            return { ...d, events: [msg.event, ...d.events.filter((e) => e.id !== msg.event.id)].slice(0, 100) };
          case 'alert': {
            const rest = d.alerts.filter((a) => a.id !== msg.alert.id);
            const active = msg.alert.status === 'open' || msg.alert.status === 'escalating';
            return { ...d, alerts: active ? [msg.alert, ...rest] : rest };
          }
          case 'alerts_cleared':
            return { ...d, alerts: [] };
          case 'location':
            return { ...d, location: msg.location };
          default:
            return d;
        }
      });
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, [load]);

  return { data, connected, history };
}
