import { EventEmitter } from 'node:events';
import type { Device } from '../types.js';

/** Things a device did, as seen by the rules engine. Producers (Aqara, IMOU, mock) emit; the engine reacts. */
export type DeviceEventType =
  | 'smoke'
  | 'smoke_clear'
  | 'door_open'
  | 'door_closed'
  | 'vibration'
  | 'offline'
  | 'online'
  | 'low_battery'
  | 'temp_warning'
  | 'temp_critical'
  | 'temp_recovered';

export interface DeviceEvent {
  type: DeviceEventType;
  device: Device;
  /** Event feed row this came from, if any. */
  eventId?: number;
  detail?: string;
}

const emitter = new EventEmitter();
emitter.setMaxListeners(20);

export const bus = {
  emit: (e: DeviceEvent) => emitter.emit('device', e),
  on: (fn: (e: DeviceEvent) => void) => emitter.on('device', fn),
};
