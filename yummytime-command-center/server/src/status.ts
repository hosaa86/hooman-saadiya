import type { Status } from './types.js';

export interface SensorLimits {
  min: number;
  max: number;
  /** Degrees beyond min/max before a reading counts as critical instead of warning. */
  criticalMargin: number;
}

export function temperatureStatus(value: number, l: SensorLimits): Status {
  const over = Math.max(l.min - value, value - l.max, 0);
  if (over === 0) return 'ok';
  return over > l.criticalMargin ? 'critical' : 'warning';
}

export const LOW_BATTERY = 20;
