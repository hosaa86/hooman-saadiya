import { Router, type Request, type Response } from 'express';
import * as repo from '../db/repo.js';
import { broadcast } from '../ws.js';
import { buildReport } from './build.js';
import { deviationsCsv, readingsCsv } from './csv.js';
import { reportPdf } from './pdf.js';
import { isDate, localMidnight, nextDay, toSqlUtc } from './time.js';

export const reports = Router();

/** ?devices=1,2&from=YYYY-MM-DD&to=YYYY-MM-DD (local dates, inclusive) */
function params(req: Request, res: Response) {
  const { from, to } = req.query;
  if (!isDate(from) || !isDate(to)) return void res.status(400).json({ error: 'from and to must be dates (YYYY-MM-DD)' });
  if (from > to) return void res.status(400).json({ error: 'from must be before to' });
  const ids = String(req.query.devices ?? '')
    .split(',')
    .filter(Boolean)
    .map(Number)
    .filter(Number.isInteger);
  return { from, to, ids };
}

const fileName = (from: string, to: string, ext: string, kind = 'temperaturlogg') => `${kind}_${from}_${to}.${ext}`;

reports.get('/sensors', (_req, res) => res.json(repo.reportSensors(repo.getLocation().id)));

reports.get('/summary', (req, res) => {
  const p = params(req, res);
  if (!p) return;
  const r = buildReport(p.ids, p.from, p.to);
  res.json(r.sensors.map(({ readings: _r, ...s }) => ({ ...s, device: { id: s.device.id, name: s.device.name, archived: s.device.archived, settings: s.device.settings } })));
});

reports.get('/temperature.csv', (req, res) => {
  const p = params(req, res);
  if (!p) return;
  const kind = req.query.kind === 'deviations' ? 'deviations' : 'readings';
  const r = buildReport(p.ids, p.from, p.to);
  res.attachment(fileName(p.from, p.to, 'csv', kind === 'deviations' ? 'avvik' : 'temperaturlogg'));
  res.type('text/csv; charset=utf-8').send(kind === 'deviations' ? deviationsCsv(r) : readingsCsv(r));
});

reports.get('/temperature.pdf', (req, res) => {
  const p = params(req, res);
  if (!p) return;
  const detail = req.query.detail === 'all' ? 'all' : 'daily';
  res.attachment(fileName(p.from, p.to, 'pdf'));
  res.type('application/pdf');
  reportPdf(buildReport(p.ids, p.from, p.to), detail).pipe(res);
});

reports.get('/deviations', (req, res) => {
  const p = params(req, res);
  if (!p) return;
  res.json(repo.listDeviations({ deviceIds: p.ids, from: toSqlUtc(localMidnight(p.from)), to: toSqlUtc(localMidnight(nextDay(p.to))) }));
});

/** Record what was done about a deviation ("tiltak") and who signed it. */
reports.put('/deviations/:id', (req, res) => {
  const action = String(req.body?.correctiveAction ?? '').trim();
  const by = String(req.body?.signedBy ?? '').trim();
  if (!action) return res.status(400).json({ error: 'Describe the corrective action' });
  if (!by) return res.status(400).json({ error: 'Enter who signs' });
  const d = repo.signDeviation(Number(req.params.id), action, by);
  if (!d) return res.status(404).json({ error: 'Deviation not found' });
  broadcast({
    type: 'event',
    event: repo.addEvent(repo.getLocation().id, { deviceId: d.deviceId, type: 'deviation_signed', severity: 'info', message: `Avvik on ${d.deviceName} signed by ${by}` }),
  });
  res.json(d);
});
