import crypto from 'node:crypto';
import { config, integrationStatus, publicUrlReachable } from '../config.js';

/**
 * Twilio REST calls without the SDK. When Twilio isn't configured, nothing is sent and the
 * attempt is logged as "simulated" so the alert flow can still be tested.
 */

export interface SendResult {
  sid: string | null;
  status: string;
  error?: string;
}

const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

async function post(resource: 'Calls' | 'Messages', form: Record<string, string>): Promise<SendResult> {
  const { accountSid, authToken, apiUrl } = config.twilio;
  const res = await fetch(`${apiUrl}/2010-04-01/Accounts/${accountSid}/${resource}.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(15_000),
  }).catch((e: Error) => ({ ok: false, json: async () => ({ message: e.message }) }) as Response);
  const body = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; message?: string; code?: number };
  if (!res.ok) return { sid: null, status: 'failed', error: `${body.code ?? ''} ${body.message ?? 'Twilio request failed'}`.trim() };
  return { sid: body.sid ?? null, status: body.status ?? 'queued' };
}

const callbackUrl = (path: string) => (publicUrlReachable() ? `${config.publicBaseUrl.replace(/\/$/, '')}/api/twilio/${path}` : null);

/** Phone call that reads the alert aloud (twice); press 1 acknowledges when Twilio can reach us. */
export async function placeCall(to: string, spoken: string, ctx: { alertId: number; contactId: number; notificationId: number }): Promise<SendResult> {
  if (!integrationStatus().twilio) return { sid: null, status: 'simulated' };
  const gather = callbackUrl(`voice?alert=${ctx.alertId}&contact=${ctx.contactId}`);
  const say = `<Say voice="${xml(config.twilio.voice)}" language="${xml(config.twilio.voiceLanguage)}">${xml(spoken)}</Say>`;
  const prompt = gather ? `<Say voice="${xml(config.twilio.voice)}" language="${xml(config.twilio.voiceLanguage)}">Press 1 to acknowledge.</Say>` : '';
  const twiml = gather
    ? `<Response><Gather numDigits="1" timeout="8" action="${xml(gather)}" method="POST">${say}${prompt}${say}${prompt}</Gather>${say}</Response>`
    : `<Response>${say}<Pause length="1"/>${say}</Response>`;
  const status = callbackUrl(`status?n=${ctx.notificationId}`);
  return post('Calls', { To: to, From: config.twilio.fromNumber, Twiml: twiml, ...(status ? { StatusCallback: status } : {}) });
}

/** WhatsApp message. Uses the approved template when WHATSAPP_CONTENT_SID is set. */
export async function sendWhatsApp(to: string, text: { title: string; body: string }, ctx: { notificationId: number }): Promise<SendResult> {
  if (!integrationStatus().whatsapp) return { sid: null, status: 'simulated' };
  const from = config.twilio.whatsappFrom.startsWith('whatsapp:') ? config.twilio.whatsappFrom : `whatsapp:${config.twilio.whatsappFrom}`;
  const status = callbackUrl(`status?n=${ctx.notificationId}`);
  const content: Record<string, string> = config.twilio.whatsappContentSid
    ? { ContentSid: config.twilio.whatsappContentSid, ContentVariables: JSON.stringify({ 1: text.title, 2: text.body }) }
    : { Body: `${text.title}\n${text.body}` };
  return post('Messages', { To: `whatsapp:${to.replace(/^whatsapp:/, '')}`, From: from, ...content, ...(status ? { StatusCallback: status } : {}) });
}

/** X-Twilio-Signature = base64(HMAC-SHA1(authToken, fullUrl + sorted POST params as key+value)). */
export function validSignature(fullUrl: string, params: Record<string, string>, signature: string | undefined): boolean {
  if (!signature || !config.twilio.authToken) return false;
  const data = fullUrl + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const expected = crypto.createHmac('sha1', config.twilio.authToken).update(data).digest('base64');
  return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export const twiml = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
export const sayTwiml = (text: string) => twiml(`<Say voice="${xml(config.twilio.voice)}" language="${xml(config.twilio.voiceLanguage)}">${xml(text)}</Say>`);
export const messageTwiml = (text: string) => twiml(`<Message>${xml(text)}</Message>`);
