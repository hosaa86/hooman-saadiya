import * as repo from '../db/repo.js';
import type { Device } from '../types.js';
import { localDayKey, localMidnight, nextDay, toSqlUtc } from './time.js';

export interface DaySummary {
  day: string; // YYYY-MM-DD local
  min: number;
  max: number;
  avg: number;
  count: number;
  outOfRange: number;
}

export interface SensorReport {
  device: Device & { archived: boolean };
  min: number | null;
  max: number | null;
  avg: number | null;
  count: number;
  inRangePct: number | null;
  days: DaySummary[];
  readings: repo.ReadingRow[];
  deviations: repo.Deviation[];
}

export interface Report {
  location: string;
  from: string;
  to: string;
  generatedAt: string;
  sensors: SensorReport[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Everything a temperature report needs, for local dates from..to (inclusive). */
export function buildReport(deviceIds: number[], from: string, to: string): Report {
  const loc = repo.getLocation();
  const all = repo.reportSensors(loc.id);
  const chosen = deviceIds.length ? all.filter((d) => deviceIds.includes(d.id)) : all;
  const fromUtc = toSqlUtc(localMidnight(from));
  const toUtc = toSqlUtc(localMidnight(nextDay(to)));
  const rows = repo.readings(chosen.map((d) => d.id), fromUtc, toUtc);
  const devs = repo.listDeviations({ deviceIds: chosen.map((d) => d.id), from: fromUtc, to: toUtc, limit: 5000 });

  return {
    location: loc.name,
    from,
    to,
    generatedAt: new Date().toISOString(),
    sensors: chosen.map((device) => {
      const readings = rows.filter((r) => r.deviceId === device.id);
      const values = readings.map((r) => r.valueC);
      const byDay = new Map<string, repo.ReadingRow[]>();
      for (const r of readings) {
        const k = localDayKey(r.recordedAt);
        if (!byDay.has(k)) byDay.set(k, []);
        byDay.get(k)!.push(r);
      }
      const days = [...byDay.entries()].map(([day, rs]) => {
        const v = rs.map((r) => r.valueC);
        return { day, min: Math.min(...v), max: Math.max(...v), avg: round1(v.reduce((a, b) => a + b, 0) / v.length), count: v.length, outOfRange: rs.filter((r) => !r.inRange).length };
      });
      return {
        device,
        min: values.length ? Math.min(...values) : null,
        max: values.length ? Math.max(...values) : null,
        avg: values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null,
        count: values.length,
        inRangePct: values.length ? Math.round((readings.filter((r) => r.inRange).length / values.length) * 1000) / 10 : null,
        days,
        readings,
        deviations: devs.filter((d) => d.deviceId === device.id).reverse(),
      };
    }),
  };
}
