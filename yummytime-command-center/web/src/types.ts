export type Category = 'camera' | 'sensor' | 'detector' | 'hub';
export type Status = 'ok' | 'warning' | 'critical' | 'offline';
export type Severity = 'info' | 'warning' | 'critical';

export interface Device {
  id: number;
  category: Category;
  kind: string;
  provider: string;
  name: string;
  sortOrder: number;
  visibleFields: string[];
  settings: Record<string, any>;
  status: Status;
  online: boolean;
  battery: number | null;
  lastValue: number | null;
  lastState: string | null;
  lastSeen: string | null;
}

export interface EventRow {
  id: number;
  deviceId: number | null;
  deviceName: string | null;
  type: string;
  severity: Severity;
  message: string;
  createdAt: string;
}

export interface Alert {
  id: number;
  severity: 'warning' | 'critical';
  title: string;
  message: string;
  status: 'open' | 'escalating' | 'acknowledged' | 'resolved';
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface Location {
  id: number;
  name: string;
  armed: boolean;
  armedBy: string | null;
  armedAt: string | null;
}

export interface DashboardData {
  location: Location;
  mockMode: boolean;
  devices: Device[];
  events: EventRow[];
  alerts: Alert[];
}

export type ServerMessage =
  | { type: 'hello'; serverTime: string }
  | { type: 'device_update'; device: Device }
  | { type: 'event'; event: EventRow }
  | { type: 'alert'; alert: Alert }
  | { type: 'alerts_cleared' }
  | { type: 'devices_changed' }
  | { type: 'location'; location: Location }
  | { type: 'open_live_view'; deviceIds: number[] };

export interface Schedule {
  enabled: boolean;
  days: number[];
  armTime: string;
  disarmTime: string;
}

export interface DeviceMeta {
  fieldOptions: Record<Category, Record<string, string>>;
  kinds: Record<Category, string[]>;
}
