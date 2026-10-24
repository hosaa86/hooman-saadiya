import { config } from '../config.js';
import * as repo from '../db/repo.js';
import { broadcast } from '../ws.js';
import type { Alert, Contact } from '../types.js';
import { placeCall, sendWhatsApp } from './twilio.js';

/**
 * Alerts: create (de-duplicated), notify, escalate, acknowledge.
 * Critical → phone call + WhatsApp to contact #1; if nobody acknowledges within that contact's
 * wait time, contact #2, … (two rounds). Warning → WhatsApp only, to contacts who want warnings.
 */

const ROUNDS = 2;
const timers = new Map<number, NodeJS.Timeout>();

const liveLink = () => `${config.publicBaseUrl.replace(/\/$/, '')}/#/live`;

function log(message: string, severity: 'info' | 'warning' | 'critical' = 'info', deviceId?: number | null) {
  broadcast({ type: 'event', event: repo.addEvent(repo.getLocation().id, { deviceId, type: 'alert', severity, message }) });
}

function push(alert: Alert) {
  broadcast({ type: 'alert', alert });
}

export interface RaiseOptions {
  severity: 'warning' | 'critical';
  title: string;
  message: string;
  deviceId?: number;
  ruleId?: number;
  eventId?: number;
  /** One open alert per key, e.g. "smoke:12". A repeat only upgrades severity. */
  dedupeKey: string;
}

export async function raiseAlert(o: RaiseOptions): Promise<Alert> {
  const loc = repo.getLocation();
  const existing = repo.findActiveAlert(o.dedupeKey);
  if (existing) {
    if (existing.severity === 'warning' && o.severity === 'critical') {
      const upgraded = repo.upgradeAlert(existing.id, 'critical', o.title, o.message);
      push(upgraded);
      escalate(upgraded, 0);
      return upgraded;
    }
    return existing;
  }
  const alert = repo.createAlert(loc.id, o);
  push(alert);
  if (alert.severity === 'critical') escalate(alert, 0);
  else await notifyWarning(alert);
  return alert;
}

async function notifyWarning(alert: Alert) {
  const loc = repo.getLocation();
  const contacts = repo.listContacts(loc.id, true).filter((c) => c.receiveWarnings);
  for (const c of contacts) await whatsApp(alert, c, `⚠️ Warning – ${alert.title}`, `${alert.message}\n${loc.name}`);
  const summary = contacts.length ? `WhatsApp sent to ${contacts.map((c) => c.name).join(', ')}` : 'No contacts receive warnings';
  push(repo.setAlertEscalation(alert.id, 0, 'open', summary));
}

async function whatsApp(alert: Alert, c: Contact, title: string, body: string) {
  const to = c.whatsapp || c.phone;
  const id = repo.addNotification({ alertId: alert.id, contactId: c.id, channel: 'whatsapp', to, sid: null, status: 'sending' });
  const r = await sendWhatsApp(to, { title, body }, { notificationId: id });
  repo.updateNotificationStatus(id, r.status, r.error);
  if (r.status === 'failed') log(`WhatsApp to ${c.name} failed: ${r.error}`, 'warning', alert.deviceId);
  return r;
}

async function call(alert: Alert, c: Contact) {
  const loc = repo.getLocation();
  const id = repo.addNotification({ alertId: alert.id, contactId: c.id, channel: 'voice', to: c.phone, sid: null, status: 'calling' });
  const spoken = `Critical alarm at ${loc.name}. ${alert.title}. ${alert.message}`;
  const r = await placeCall(c.phone, spoken, { alertId: alert.id, contactId: c.id, notificationId: id });
  repo.updateNotificationStatus(id, r.status, r.error);
  if (r.status === 'failed') log(`Call to ${c.name} failed: ${r.error}`, 'warning', alert.deviceId);
  return r;
}

/** Call + WhatsApp the contact for this step, then wait for their acknowledgement before the next one. */
async function escalate(alert: Alert, step: number) {
  clearTimeout(timers.get(alert.id));
  const current = repo.getAlert(alert.id);
  if (!current || (current.status !== 'open' && current.status !== 'escalating')) return;

  const loc = repo.getLocation();
  const contacts = repo.listContacts(loc.id, true);
  if (contacts.length === 0) {
    log(`Nobody was called for "${current.title}" — add alert contacts under Alerts`, 'critical', current.deviceId);
    push(repo.setAlertEscalation(current.id, step, 'open', 'No contacts to call'));
    return;
  }
  if (step >= contacts.length * ROUNDS) {
    log(`Escalation finished — nobody acknowledged "${current.title}"`, 'critical', current.deviceId);
    push(repo.setAlertEscalation(current.id, step, 'open', 'Nobody acknowledged'));
    return;
  }

  const c = contacts[step % contacts.length];
  const [voice] = await Promise.all([
    call(current, c),
    whatsApp(current, c, `🚨 CRITICAL – ${current.title}`, `${current.message}\nLive view: ${liveLink()}\nReply OK to acknowledge.`),
  ]);
  const simulated = voice.status === 'simulated' ? ' (simulated — Twilio not set up)' : '';
  const summary = `Calling ${c.name} (${step + 1}/${contacts.length * ROUNDS})${simulated}`;
  log(`${summary}: ${current.title}`, 'info', current.deviceId);
  push(repo.setAlertEscalation(current.id, step, 'escalating', summary));

  timers.set(current.id, setTimeout(() => escalate(current, step + 1), c.waitMinutes * 60_000));
}

export function acknowledge(id: number, by: string, channel: 'dashboard' | 'phone_keypress' | 'whatsapp'): Alert | undefined {
  const before = repo.getAlert(id);
  if (!before) return undefined;
  if (before.status !== 'open' && before.status !== 'escalating') return before;
  clearTimeout(timers.get(id));
  timers.delete(id);
  const alert = repo.acknowledgeAlert(id, by, channel)!;
  push(alert);
  const via = { dashboard: 'dashboard', phone_keypress: 'phone', whatsapp: 'WhatsApp' }[channel];
  log(`"${alert.title}" acknowledged by ${by} (${via})`, 'info', alert.deviceId);
  return alert;
}

/** Close an alert because the cause went away (temperature back in range, device online again). */
export function resolveByKey(dedupeKey: string, reason: string) {
  const a = repo.findActiveAlert(dedupeKey);
  if (!a) return;
  clearTimeout(timers.get(a.id));
  timers.delete(a.id);
  push(repo.resolveAlert(a.id));
  log(`Resolved: ${a.title} — ${reason}`, 'info', a.deviceId);
}

export function resolveAll() {
  const loc = repo.getLocation();
  for (const a of repo.listActiveAlerts(loc.id)) {
    clearTimeout(timers.get(a.id));
    timers.delete(a.id);
    repo.resolveAlert(a.id);
  }
  broadcast({ type: 'alerts_cleared' });
}

/** After a restart, continue escalations that were in progress. */
export function resumeEscalations() {
  for (const a of repo.escalatingAlerts()) timers.set(a.id, setTimeout(() => escalate(a, a.escalationStep + 1), 60_000));
}

/** Send a test call/message to one contact (no alert involved). */
export async function testContact(c: Contact) {
  const loc = repo.getLocation();
  const alert = repo.createAlert(loc.id, { severity: 'warning', title: 'Test message', message: `Test from ${loc.name} command center`, dedupeKey: `test:${Date.now()}` });
  const [v, w] = await Promise.all([call(alert, c), whatsApp(alert, c, '✅ Test – YummyTime alerts', `Alerts for ${loc.name} reach you here.\nLive view: ${liveLink()}`)]);
  repo.resolveAlert(alert.id);
  return { call: v, whatsapp: w };
}
