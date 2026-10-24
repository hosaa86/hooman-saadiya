import express, { Router } from 'express';
import { config, integrationStatus, publicUrlReachable } from '../config.js';
import * as repo from '../db/repo.js';
import { TRIGGERS } from '../rules/engine.js';
import type { Rule } from '../types.js';
import { acknowledge, testContact } from './service.js';
import { messageTwiml, sayTwiml, validSignature } from './twilio.js';

export const alertsApi = Router();

const PHONE = /^\+\d{8,15}$/;

// ---- Contacts (escalation order) -------------------------------------------

alertsApi.get('/contacts', (_req, res) => res.json(repo.listContacts(repo.getLocation().id)));

function contactFrom(body: any): { error?: string; value?: Parameters<typeof repo.saveContact>[1] } {
  const name = String(body?.name ?? '').trim();
  const phone = String(body?.phone ?? '').replace(/[\s-]/g, '');
  const whatsapp = String(body?.whatsapp ?? '').replace(/[\s-]/g, '');
  const escalationOrder = Number(body?.escalationOrder ?? 1);
  const waitMinutes = Number(body?.waitMinutes ?? 5);
  if (!name) return { error: 'Name is required' };
  if (!PHONE.test(phone)) return { error: 'Phone must be in international format, e.g. +4791234567' };
  if (whatsapp && !PHONE.test(whatsapp)) return { error: 'WhatsApp number must be in international format, e.g. +4791234567' };
  if (!Number.isInteger(escalationOrder) || escalationOrder < 1) return { error: 'Order must be 1 or higher' };
  if (!(waitMinutes >= 1 && waitMinutes <= 60)) return { error: 'Wait time must be 1–60 minutes' };
  return { value: { name, phone, whatsapp: whatsapp || null, escalationOrder, waitMinutes, receiveWarnings: body?.receiveWarnings !== false, enabled: body?.enabled !== false } };
}

alertsApi.post('/contacts', (req, res) => {
  const c = contactFrom(req.body);
  if (c.error) return res.status(400).json({ error: c.error });
  res.status(201).json(repo.saveContact(repo.getLocation().id, c.value!));
});

alertsApi.put('/contacts/:id', (req, res) => {
  if (!repo.getContact(Number(req.params.id))) return res.status(404).json({ error: 'Contact not found' });
  const c = contactFrom(req.body);
  if (c.error) return res.status(400).json({ error: c.error });
  res.json(repo.saveContact(repo.getLocation().id, { ...c.value!, id: Number(req.params.id) }));
});

alertsApi.delete('/contacts/:id', (req, res) => {
  repo.deleteContact(Number(req.params.id));
  res.json({ ok: true });
});

alertsApi.post('/contacts/:id/test', async (req, res) => {
  const c = repo.getContact(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Contact not found' });
  res.json(await testContact(c));
});

// ---- Rules ---------------------------------------------------------------------

alertsApi.get('/rules', (_req, res) => res.json({ rules: repo.listRules(repo.getLocation().id), triggers: TRIGGERS }));

function ruleFrom(body: any): { error?: string; value?: Omit<Rule, 'id' | 'sortOrder'> } {
  const name = String(body?.name ?? '').trim();
  const events: string[] = Array.isArray(body?.events) ? body.events : [];
  if (!name) return { error: 'Name is required' };
  if (events.length === 0 || !events.every((e) => (TRIGGERS as readonly string[]).includes(e))) return { error: 'Pick at least one trigger' };
  if (!['none', 'warning', 'critical'].includes(body?.alertSeverity)) return { error: 'Alert must be none, warning or critical' };
  return {
    value: {
      name,
      enabled: body?.enabled !== false,
      events,
      armedOnly: !!body?.armedOnly,
      recordCameras: !!body?.recordCameras,
      openLiveView: !!body?.openLiveView,
      alertSeverity: body.alertSeverity,
      escalateToCritical: !!body?.escalateToCritical,
    },
  };
}

alertsApi.post('/rules', (req, res) => {
  const r = ruleFrom(req.body);
  if (r.error) return res.status(400).json({ error: r.error });
  res.status(201).json(repo.saveRule(repo.getLocation().id, r.value!));
});

alertsApi.put('/rules/:id', (req, res) => {
  const r = ruleFrom(req.body);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json(repo.saveRule(repo.getLocation().id, { ...r.value!, id: Number(req.params.id) }));
});

alertsApi.delete('/rules/:id', (req, res) => {
  repo.deleteRule(Number(req.params.id));
  res.json({ ok: true });
});

// ---- Alert log -------------------------------------------------------------------

alertsApi.get('/alerts', (_req, res) => {
  const alerts = repo.listAlerts(repo.getLocation().id, 100).filter((a) => !a.dedupeKey?.startsWith('test:'));
  const notes = repo.listNotifications(alerts.map((a) => a.id));
  res.json(alerts.map((a) => ({ ...a, notifications: notes.filter((n) => n.alertId === a.id) })));
});

alertsApi.post('/alerts/:id/ack', (req, res) => {
  const alert = acknowledge(Number(req.params.id), String(req.body?.by ?? 'Hooman'), 'dashboard');
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  res.json(alert);
});

alertsApi.get('/alerts/setup', (_req, res) =>
  res.json({
    twilio: integrationStatus().twilio,
    whatsapp: integrationStatus().whatsapp,
    whatsappTemplate: !!config.twilio.whatsappContentSid,
    publicUrl: config.publicBaseUrl,
    callbacks: publicUrlReachable(),
  }),
);

// ---- Twilio webhooks (no app login; verified by Twilio signature) ------------------

export const twilioWebhooks = Router();
twilioWebhooks.use(express.urlencoded({ extended: false }));

twilioWebhooks.use((req, res, next) => {
  const url = config.publicBaseUrl.replace(/\/$/, '') + req.originalUrl;
  if (!validSignature(url, req.body ?? {}, req.header('X-Twilio-Signature'))) return res.status(403).send('Invalid signature');
  next();
});

/** Keypress during the alarm call. */
twilioWebhooks.post('/voice', (req, res) => {
  const contact = repo.getContact(Number(req.query.contact));
  res.type('text/xml');
  if (req.body.Digits !== '1') return res.send(sayTwiml('Not acknowledged. Goodbye.'));
  const alert = acknowledge(Number(req.query.alert), contact?.name ?? 'phone', 'phone_keypress');
  res.send(sayTwiml(alert ? 'Alarm acknowledged. Thank you.' : 'Alarm not found.'));
});

/** Reply "OK" on WhatsApp acknowledges the open critical alarms. */
twilioWebhooks.post('/whatsapp', (req, res) => {
  res.type('text/xml');
  const loc = repo.getLocation();
  const contact = repo.findContactByNumber(loc.id, String(req.body.From ?? ''));
  if (!contact) return res.send(messageTwiml('This number is not an alert contact.'));
  if (!/^\s*(ok|1|ack|yes|ja)\b/i.test(String(req.body.Body ?? ''))) return res.send(messageTwiml('Reply OK to acknowledge the alarm.'));
  const open = repo.listActiveAlerts(loc.id);
  if (open.length === 0) return res.send(messageTwiml('No open alarms.'));
  open.forEach((a) => acknowledge(a.id, contact.name, 'whatsapp'));
  res.send(messageTwiml(`Acknowledged: ${open.map((a) => a.title).join('; ')}`));
});

/** Delivery / call status updates. */
twilioWebhooks.post('/status', (req, res) => {
  const status = String(req.body.CallStatus ?? req.body.MessageStatus ?? '');
  if (status) repo.updateNotificationStatus(Number(req.query.n), status, req.body.ErrorMessage ?? null);
  res.sendStatus(204);
});
