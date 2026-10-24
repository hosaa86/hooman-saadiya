import PDFDocument from 'pdfkit';
import type { Report, SensorReport } from './build.js';
import { localDate, localDateTime, localTime } from './time.js';

/**
 * Temperature log for Mattilsynet (internkontroll): per sensor the limits, a summary, a daily
 * table, every deviation with corrective action and sign-off, and optionally every reading.
 */

const M = 48; // page margin
const C = { ink: '#1c1917', muted: '#78716c', line: '#d6d3d1', bad: '#b91c1c', head: '#f5f5f4' };
const deg = (n: number | null | undefined) => (n == null ? '–' : `${n.toFixed(1).replace('.', ',')} °C`);
const dayLabel = (day: string) => day.split('-').reverse().join('.');
const minutes = (a: string, b: string | null) => {
  const m = Math.round(((b ? new Date(b).getTime() : Date.now()) - new Date(a).getTime()) / 60_000);
  return m >= 120 ? `${Math.floor(m / 60)} t ${m % 60} min` : `${m} min`;
};

type Doc = PDFKit.PDFDocument;

function ensure(doc: Doc, height: number, onNewPage?: () => void) {
  if (doc.y + height > doc.page.height - M - 20) {
    doc.addPage();
    onNewPage?.();
  }
}

/** Simple table with a repeated header row on each new page. */
function table(doc: Doc, cols: { label: string; width: number; align?: 'left' | 'right' }[], rows: { cells: string[]; bad?: boolean }[]) {
  const rowH = 16;
  const header = () => {
    let x = M;
    doc.rect(M, doc.y, cols.reduce((a, c) => a + c.width, 0), rowH).fill(C.head);
    doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(8);
    const y = doc.y + 4;
    for (const c of cols) {
      doc.text(c.label, x + 4, y, { width: c.width - 8, align: c.align ?? 'left', lineBreak: false });
      x += c.width;
    }
    doc.y = y - 4 + rowH;
  };
  ensure(doc, rowH * 2);
  header();
  for (const r of rows) {
    // Wrap long cells (e.g. corrective action) by measuring the tallest one
    doc.font('Helvetica').fontSize(8.5);
    const h = Math.max(rowH, ...r.cells.map((t, i) => doc.heightOfString(t, { width: cols[i].width - 8 }) + 7));
    ensure(doc, h, header);
    let x = M;
    const y = doc.y;
    doc.fillColor(r.bad ? C.bad : C.ink);
    r.cells.forEach((t, i) => {
      doc.text(t, x + 4, y + 4, { width: cols[i].width - 8, align: cols[i].align ?? 'left' });
      x += cols[i].width;
    });
    doc.moveTo(M, y + h).lineTo(x, y + h).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.y = y + h;
  }
  doc.moveDown(0.8);
}

function heading(doc: Doc, text: string, size = 11) {
  ensure(doc, 40);
  doc.x = M;
  doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(size).text(text, M);
  doc.moveDown(0.3);
}

function sensorSection(doc: Doc, s: SensorReport, detail: 'daily' | 'all') {
  const d = s.device;
  heading(doc, `${d.name}${d.archived ? ' (fjernet)' : ''}`, 14);
  doc.font('Helvetica').fontSize(9.5).fillColor(C.muted);
  doc.text(`Grenseverdier ${deg(Number(d.settings.min))} til ${deg(Number(d.settings.max))} · logges hvert ${d.settings.logIntervalMin ?? 15}. minutt`, M);
  doc.moveDown(0.4);

  const stats: [string, string][] = [
    ['Målinger', String(s.count)],
    ['Laveste', deg(s.min)],
    ['Høyeste', deg(s.max)],
    ['Snitt', deg(s.avg)],
    ['Innenfor grense', s.inRangePct == null ? '–' : `${String(s.inRangePct).replace('.', ',')} %`],
    ['Avvik', String(s.deviations.length)],
  ];
  const w = (doc.page.width - 2 * M) / stats.length;
  const y = doc.y;
  stats.forEach(([label, value], i) => {
    doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(label, M + i * w, y, { width: w - 6 });
    doc.font('Helvetica-Bold').fontSize(12).fillColor(label === 'Avvik' && s.deviations.length ? C.bad : C.ink).text(value, M + i * w, y + 11, { width: w - 6 });
  });
  doc.y = y + 34;
  doc.x = M;

  if (s.count === 0) {
    doc.font('Helvetica').fontSize(9.5).fillColor(C.muted).text('Ingen målinger i perioden.', M);
    doc.moveDown(1);
    return;
  }

  heading(doc, 'Døgnoversikt');
  table(
    doc,
    [
      { label: 'Dato', width: 90 },
      { label: 'Laveste', width: 80, align: 'right' },
      { label: 'Høyeste', width: 80, align: 'right' },
      { label: 'Snitt', width: 80, align: 'right' },
      { label: 'Målinger', width: 80, align: 'right' },
      { label: 'Utenfor grense', width: 89, align: 'right' },
    ],
    s.days.map((x) => ({ cells: [dayLabel(x.day), deg(x.min), deg(x.max), deg(x.avg), String(x.count), String(x.outOfRange)], bad: x.outOfRange > 0 })),
  );

  heading(doc, 'Avvik og tiltak');
  if (s.deviations.length === 0) {
    doc.font('Helvetica').fontSize(9.5).fillColor(C.muted).text('Ingen avvik i perioden.', M);
    doc.moveDown(1);
  } else {
    table(
      doc,
      [
        { label: 'Start', width: 72 },
        { label: 'Varighet', width: 56 },
        { label: 'Topp', width: 50, align: 'right' },
        { label: 'Nivå', width: 48 },
        { label: 'Tiltak', width: 167 },
        { label: 'Signert', width: 106 },
      ],
      s.deviations.map((v) => ({
        cells: [
          localDateTime(v.startedAt),
          v.endedAt ? minutes(v.startedAt, v.endedAt) : `pågår (${minutes(v.startedAt, null)})`,
          deg(v.peakValueC),
          v.severity === 'critical' ? 'Kritisk' : 'Advarsel',
          v.correctiveAction || 'Ikke registrert',
          v.signedBy ? `${v.signedBy}\n${localDateTime(v.signedAt!)}` : '–',
        ],
        bad: !v.correctiveAction,
      })),
    );
  }

  if (detail === 'all') {
    heading(doc, 'Alle målinger');
    table(
      doc,
      [
        { label: 'Dato', width: 100 },
        { label: 'Tid', width: 80 },
        { label: 'Temperatur', width: 100, align: 'right' },
        { label: 'Status', width: 219 },
      ],
      s.readings.map((r) => ({ cells: [localDate(r.recordedAt), localTime(r.recordedAt), deg(r.valueC), r.inRange ? 'OK' : 'Utenfor grense'], bad: !r.inRange })),
    );
  }
}

export function reportPdf(r: Report, detail: 'daily' | 'all'): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, info: { Title: `Temperaturlogg ${r.location} ${r.from}–${r.to}`, Author: 'YummyTime Command Center' } });

  doc.font('Helvetica-Bold').fontSize(20).fillColor(C.ink).text('Temperaturlogg', M, M);
  doc.font('Helvetica').fontSize(11).fillColor(C.muted).text(`${r.location} · ${dayLabel(r.from)} – ${dayLabel(r.to)}`);
  doc.fontSize(8.5).text(`Internkontroll (Mattilsynet) · laget ${localDateTime(r.generatedAt)} · ${r.sensors.length} sensor${r.sensors.length === 1 ? '' : 'er'}`);
  doc.moveDown(1.2);

  r.sensors.forEach((s, i) => {
    if (i > 0) ensure(doc, 200);
    sensorSection(doc, s, detail);
    doc.moveDown(0.5);
  });

  ensure(doc, 70);
  doc.moveDown(1);
  const y = doc.y + 20;
  doc.moveTo(M, y).lineTo(M + 220, y).moveTo(M + 260, y).lineTo(M + 400, y).lineWidth(0.7).strokeColor(C.ink).stroke();
  doc.font('Helvetica').fontSize(8.5).fillColor(C.muted).text('Kontrollert av (navn og signatur)', M, y + 4).text('Dato', M + 260, y + 4);

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    // Footer sits below the bottom margin; without this PDFKit would start a new page for it
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7.5).fillColor(C.muted).text(`${r.location} · Temperaturlogg · side ${i + 1} av ${range.count}`, M, doc.page.height - M + 14, { width: doc.page.width - 2 * M, align: 'center', lineBreak: false });
  }
  doc.end();
  return doc;
}
