export type Category = 'camera' | 'sensor' | 'detector' | 'hub';
export type Status = 'ok' | 'warning' | 'critical' | 'offline';
export type Severity = 'info' | 'warning' | 'critical';

export interface Device {
  id: number;
  locationId: number;
  category: Category;
  kind: string;
  provider: string;
  externalId: string | null;
  channelId: string | null;
  name: string;
  sortOrder: number;
  visibleFields: string[];
  settings: Record<string, unknown>;
  status: Status;
  online: boolean;
  battery: number | null;
  lastValue: number | null;
  lastState: string | null;
  lastSeen: string | null;
  /** Time of the latest saved snapshot (cameras). */
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
  dedupeKey: string | null;
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
  providerSid: string | null;
  status: string;
  error: string | null;
  createdAt: string;
}

/** A rule as edited in the UI (stored as trigger/conditions/actions JSON). */
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

export interface Location {
  id: number;
  name: string;
  armed: boolean;
  armedBy: string | null;
  armedAt: string | null;
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
