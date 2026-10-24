import type { Alert, Category, DashboardData, Device, DeviceMeta, Location, Schedule } from './types';

async function req<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      msg = JSON.parse(text).error ?? text;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  dashboard: () => req<DashboardData>('/dashboard'),
  setArmed: (armed: boolean) => req<Location>('/location/arm', { armed, by: 'Hooman' }),
  ack: (id: number) => req<Alert>(`/alerts/${id}/ack`, { by: 'Hooman' }),
  meta: () => req<DeviceMeta>('/devices/meta'),
  addDevice: (d: { category: Category; kind: string; name: string; externalId?: string }) => req<Device>('/devices', d),
  updateDevice: (id: number, patch: Partial<Pick<Device, 'name' | 'visibleFields' | 'settings'>>) =>
    req<Device>(`/devices/${id}`, patch, 'PATCH'),
  deleteDevice: (id: number) => req<{ result: 'deleted' | 'archived' }>(`/devices/${id}`, undefined, 'DELETE'),
  reorder: (ids: number[]) => req('/devices/order', { ids }, 'PUT'),
  testDetector: (id: number) => req(`/devices/${id}/test`, {}),
  schedule: () => req<Schedule>('/location/schedule'),
  setSchedule: (s: Schedule) => req<Schedule>('/location/schedule', s, 'PUT'),
  scenario: (name: 'smoke' | 'intrusion' | 'temperature' | 'reset') => req(`/mock/scenario/${name}`, {}),
};
