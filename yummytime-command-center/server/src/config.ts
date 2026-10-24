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
  },
  aqara: {
    appId: env('AQARA_APP_ID'),
    keyId: env('AQARA_KEY_ID'),
    appKey: env('AQARA_APP_KEY'),
    region: env('AQARA_REGION', 'eu'),
    account: env('AQARA_ACCOUNT'),
  },
  twilio: {
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
