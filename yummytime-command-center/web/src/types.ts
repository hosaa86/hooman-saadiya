export type Category = 'camera' | 'sensor' | 'detector' | 'hub';
export type Status = 'ok' | 'warning' | 'critical' | 'offline';
export type Severity = 'info' | 'warning' | 'critical';

export interface Device {
  id: number;
  category: Category;
  kind: string;
  provider: string;
  externalId: string | null;
  channelId: string | null;
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
  snapshotAt: string | null;
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
  ackChannel: string | null;
  createdAt: string;
  deviceId: number | null;
  escalationStep: number;
  lastNotification: string | null;
  resolvedAt: string | null;
}

export interface Contact {
  id: number;
  name: string;
  phone: string;
  whatsapp: string | null;
  escalationOrder: number;
  waitMinutes: number;
  receiveWarnings: boolean;
  enabled: boolean;
}

export interface Notification {
  id: number;
  alertId: number;
  contactName: string | null;
  channel: 'voice' | 'whatsapp' | 'sms';
  toNumber: string;
  status: string;
  error: string | null;
  createdAt: string;
}

export type AlertWithLog = Alert & { notifications: Notification[] };

export interface Rule {
  id: number;
  name: string;
  enabled: boolean;
  events: string[];
  armedOnly: boolean;
  recordCameras: boolean;
  openLiveView: boolean;
  alertSeverity: 'none' | 'warning' | 'critical';
  escalateToCritical: boolean;
  sortOrder: number;
}

export interface AlertSetup {
  twilio: boolean;
  whatsapp: boolean;
  whatsappTemplate: boolean;
  publicUrl: string;
  callbacks: boolean;
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

export interface Recording {
  id: number;
  deviceId: number;
  reason: string;
  filePath: string | null;
  startedAt: string;
  endedAt: string | null;
  sizeBytes: number | null;
}

export interface AqaraStatus {
  configured: boolean;
  region: string;
  pollSec: number;
  connected: boolean;
  account: string | null;
  expiresAt: string | null;
  lastPollAt: string | null;
  lastError: string | null;
  deviceCount: number;
}

export interface AqaraResource {
  resourceId: string;
  name: string;
  value: string | null;
  time: string | null;
}

export interface Deviation {
  id: number;
  deviceId: number;
  deviceName: string | null;
  startedAt: string;
  endedAt: string | null;
  peakValueC: number | null;
  minLimit: number | null;
  maxLimit: number | null;
  severity: 'warning' | 'critical';
  correctiveAction: string | null;
  signedBy: string | null;
  signedAt: string | null;
}

export interface SensorSummary {
  device: { id: number; name: string; archived: boolean; settings: Record<string, any> };
  min: number | null;
  max: number | null;
  avg: number | null;
  count: number;
  inRangePct: number | null;
  days: { day: string; min: number; max: number; avg: number; count: number; outOfRange: number }[];
  deviations: Deviation[];
}

export type ReportSensor = Device & { archived: boolean };
