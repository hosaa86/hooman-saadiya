import type { Category } from '../types.js';

/** Fields a card can show, per category (key → label). Order = display order in settings. */
export const FIELD_OPTIONS: Record<Category, Record<string, string>> = {
  camera: { live: 'Live thumbnail', rec: 'REC badge', status: 'Status dot' },
  sensor: { value: 'Value + trend', limits: 'Limits', battery: 'Battery', lastSeen: 'Last update' },
  detector: { state: 'State', armed: 'Armed state', battery: 'Battery' },
  hub: { connection: 'Connection', linked: 'Linked devices' },
};

export const KINDS: Record<Category, string[]> = {
  camera: ['camera'],
  sensor: ['temperature'],
  detector: ['smoke', 'door', 'vibration'],
  hub: ['hub'],
};

export const defaultFields = (c: Category) => Object.keys(FIELD_OPTIONS[c]);

export function defaultSettings(kind: string): Record<string, unknown> {
  switch (kind) {
    case 'camera':
      return { recordingMode: 'on_event', clipSeconds: 60 };
    case 'temperature':
      return { logIntervalMin: 15, min: 0, max: 4, criticalMargin: 2, warnAfterMin: 15, criticalAfterMin: 45, mockMean: 3 };
    case 'smoke':
      return { armedSchedule: false, sensitivity: 'high' };
    case 'door':
    case 'vibration':
      return { armedSchedule: true, sensitivity: 'medium' };
    default:
      return {};
  }
}

/** Initial live state for a newly added mock device. */
export function defaultMockState(kind: string) {
  const base = { online: 1, status: 'ok', battery: 100 as number | null, last_value: null as number | null, last_state: null as string | null };
  switch (kind) {
    case 'camera':
      return { ...base, battery: null, last_state: 'idle' };
    case 'temperature':
      return { ...base, last_value: 3 };
    case 'smoke':
      return { ...base, last_state: 'clear' };
    case 'door':
      return { ...base, last_state: 'closed' };
    case 'vibration':
      return { ...base, last_state: 'still' };
    default:
      return { ...base, battery: null, last_state: 'connected' };
  }
}

const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** Validate a settings object for a device kind. Returns an error message or null. */
export function validateSettings(kind: string, s: Record<string, unknown>): string | null {
  if (kind === 'camera') {
    if (!['off', 'on_event', 'continuous'].includes(String(s.recordingMode))) return 'Recording mode must be off, on_event or continuous';
    if (!num(s.clipSeconds, 5, 3600)) return 'Clip length must be 5–3600 seconds';
  }
  if (kind === 'temperature') {
    if (!num(s.logIntervalMin, 1, 1440)) return 'Logging interval must be 1–1440 minutes';
    if (!num(s.min, -60, 100) || !num(s.max, -60, 100)) return 'Limits must be between −60 and 100 °C';
    if ((s.min as number) >= (s.max as number)) return 'Min limit must be lower than max limit';
    if (!num(s.criticalMargin, 0, 50)) return 'Critical margin must be 0–50 °C';
    if (!num(s.warnAfterMin, 0, 1440) || !num(s.criticalAfterMin, 0, 1440)) return 'Durations must be 0–1440 minutes';
    if ((s.criticalAfterMin as number) < (s.warnAfterMin as number)) return 'Critical delay must be longer than warning delay';
  }
  if (['smoke', 'door', 'vibration'].includes(kind)) {
    if (!['low', 'medium', 'high'].includes(String(s.sensitivity))) return 'Sensitivity must be low, medium or high';
    if (typeof s.armedSchedule !== 'boolean') return 'Armed schedule must be on or off';
  }
  return null;
}
