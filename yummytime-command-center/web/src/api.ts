import type { Alert, DashboardData, Location } from './types';

async function req<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

export const api = {
  dashboard: () => req<DashboardData>('/dashboard'),
  setArmed: (armed: boolean) => req<Location>('/location/arm', { armed, by: 'Hooman' }),
  ack: (id: number) => req<Alert>(`/alerts/${id}/ack`, { by: 'Hooman' }),
  scenario: (name: 'smoke' | 'intrusion' | 'temperature' | 'reset') => req(`/mock/scenario/${name}`, {}),
};
