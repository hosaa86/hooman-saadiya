import type { Report } from './build.js';
import { localDate, localDateTime, localTime } from './time.js';

// Semicolons + decimal comma so Excel in Norwegian opens it directly; BOM for æøå
const num = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
const cell = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const csv = (rows: (string | number | null)[][]) => '﻿' + rows.map((r) => r.map((c) => cell(typeof c === 'number' ? num(c) : (c ?? ''))).join(';')).join('\r\n') + '\r\n';

export function readingsCsv(r: Report): string {
  const rows: (string | number | null)[][] = [['Dato', 'Tid', 'Sensor', 'Temperatur (°C)', 'Min grense (°C)', 'Maks grense (°C)', 'Innenfor grense']];
  for (const s of r.sensors)
    for (const x of s.readings) rows.push([localDate(x.recordedAt), localTime(x.recordedAt), s.device.name, x.valueC, x.minLimit, x.maxLimit, x.inRange ? 'Ja' : 'Nei']);
  return csv(rows);
}

export function deviationsCsv(r: Report): string {
  const rows: (string | number | null)[][] = [['Sensor', 'Start', 'Slutt', 'Toppverdi (°C)', 'Min grense (°C)', 'Maks grense (°C)', 'Alvorlighet', 'Tiltak', 'Signert av', 'Signert']];
  for (const s of r.sensors)
    for (const d of s.deviations)
      rows.push([
        s.device.name,
        localDateTime(d.startedAt),
        d.endedAt ? localDateTime(d.endedAt) : 'Pågår',
        d.peakValueC,
        d.minLimit,
        d.maxLimit,
        d.severity === 'critical' ? 'Kritisk' : 'Advarsel',
        d.correctiveAction ?? '',
        d.signedBy ?? '',
        d.signedAt ? localDateTime(d.signedAt) : '',
      ]);
  return csv(rows);
}
