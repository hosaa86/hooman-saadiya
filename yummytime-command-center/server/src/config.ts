import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
// Project root = yummytime-command-center/
export const ROOT_DIR = path.resolve(here, '..', '..');

dotenv.config({ path: path.join(ROOT_DIR, '.env') });

const env = (key: string, fallback = ''): string => process.env[key] ?? fallback;

export const config = {
  port: Number(env('PORT', '4000')),
  dataDir: path.resolve(ROOT_DIR, env('DATA_DIR', './data')),
  publicBaseUrl: env('PUBLIC_BASE_URL', 'http://localhost:5173'),
  mockMode: env('MOCK_MODE', 'true') === 'true',
  locationName: env('LOCATION_NAME', 'Yummy Time Capsule'),
  imou: {
    appId: env('IMOU_APP_ID'),
    appSecret: env('IMOU_APP_SECRET'),
    dataCenter: env('IMOU_DATA_CENTER', 'fk'),
    /** Override only for testing (e.g. the fake IMOU server). Default is derived from the data center. */
    apiUrl: env('IMOU_API_URL'),
    statusPollSec: Number(env('IMOU_STATUS_POLL_SEC', '60')),
    snapshotIntervalMin: Number(env('SNAPSHOT_INTERVAL_MIN', '5')),
  },
  /** Optional password for the whole app (browser login prompt). Strongly recommended before exposing it outside the LAN. */
  appPassword: env('APP_PASSWORD'),
  timezone: env('TZ', 'Europe/Oslo'),
  recording: {
    ffmpegPath: env('FFMPEG_PATH'),
    retentionDays: Number(env('RECORDING_RETENTION_DAYS', '14')),
  },
  aqara: {
    appId: env('AQARA_APP_ID'),
    keyId: env('AQARA_KEY_ID'),
    appKey: env('AQARA_APP_KEY'),
    region: env('AQARA_REGION', 'eu'),
    account: env('AQARA_ACCOUNT'),
    /** Override only for testing (e.g. the fake Aqara server). */
    apiUrl: env('AQARA_API_URL'),
    /** How often detectors and sensors are read. Lower = faster alarms, more API calls. */
    pollSec: Number(env('AQARA_POLL_SEC', '20')),
    tokenValidity: env('AQARA_TOKEN_VALIDITY', '7d'),
  },
  twilio: {
    /** Override only for testing. */
    apiUrl: env('TWILIO_API_URL', 'https://api.twilio.com'),
    /** Approved WhatsApp template (Content SID) with {{1}} = title, {{2}} = details + link. Needed outside the 24 h reply window. */
    whatsappContentSid: env('WHATSAPP_CONTENT_SID'),
    voice: env('ALERT_VOICE', 'Polly.Amy'),
    voiceLanguage: env('ALERT_VOICE_LANGUAGE', 'en-GB'),
    accountSid: env('TWILIO_ACCOUNT_SID'),
    authToken: env('TWILIO_AUTH_TOKEN'),
    fromNumber: env('TWILIO_FROM_NUMBER'),
    whatsappFrom: env('WHATSAPP_FROM'),
  },
};

/** Which integrations have credentials filled in (values are never exposed). */
export function integrationStatus() {
  return {
    imou: Boolean(config.imou.appId && config.imou.appSecret),
    aqara: Boolean(config.aqara.appId && config.aqara.keyId && config.aqara.appKey),
    twilio: Boolean(config.twilio.accountSid && config.twilio.authToken && config.twilio.fromNumber),
    whatsapp: Boolean(config.twilio.accountSid && config.twilio.authToken && config.twilio.whatsappFrom),
  };
}

/** Twilio can only call back (keypress, delivery status) when PUBLIC_BASE_URL is a public https address. */
export function publicUrlReachable(): boolean {
  try {
    const u = new URL(config.publicBaseUrl);
    return u.protocol === 'https:' && !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname);
  } catch {
    return false;
  }
}
