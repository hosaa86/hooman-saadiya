import { config } from '../config.js';

/** Milliseconds the zone is ahead of UTC at `date` (e.g. +1 h / +2 h for Oslo). */
function offsetMs(date: Date, timeZone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Local midnight of a 'YYYY-MM-DD' date in the location's time zone, as a UTC Date. */
export function localMidnight(date: string, timeZone = config.timezone): Date {
  const [y, m, d] = date.split('-').map(Number);
  let t = Date.UTC(y, m - 1, d);
  for (let i = 0; i < 2; i++) t = Date.UTC(y, m - 1, d) - offsetMs(new Date(t), timeZone);
  return new Date(t);
}

export const toSqlUtc = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');

export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('nb-NO', { timeZone: config.timezone, ...opts });
export const localDate = (iso: string) => fmt({ day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
export const localTime = (iso: string) => fmt({ hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const localDateTime = (iso: string) => `${localDate(iso)} ${localTime(iso)}`;
/** 'YYYY-MM-DD' of an instant in the location's time zone (for grouping by day). */
export const localDayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(new Date(iso));
