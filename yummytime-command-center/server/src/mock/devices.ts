import type Database from 'better-sqlite3';

const j = JSON.stringify;

const CAMERA_FIELDS = ['live', 'rec', 'status'];
const SENSOR_FIELDS = ['value', 'limits', 'battery', 'lastSeen'];
const DETECTOR_FIELDS = ['state', 'armed', 'battery'];
const HUB_FIELDS = ['connection', 'linked'];

type Row = [category: string, kind: string, name: string, settings: object, state: object];

/** Mock devices for the Capsule location — mirrors the real setup (5 IMOU cams + Aqara). */
const MOCK: Row[] = [
  ['camera', 'camera', 'Inngang', { recordingMode: 'on_event', clipSeconds: 60 }, { online: 1, status: 'ok', last_state: 'idle' }],
  ['camera', 'camera', 'Kasse', { recordingMode: 'on_event', clipSeconds: 60 }, { online: 1, status: 'ok', last_state: 'idle' }],
  ['camera', 'camera', 'Kjøkken', { recordingMode: 'continuous', clipSeconds: 300 }, { online: 1, status: 'ok', last_state: 'recording' }],
  ['camera', 'camera', 'Spisesal', { recordingMode: 'on_event', clipSeconds: 60 }, { online: 1, status: 'ok', last_state: 'idle' }],
  ['camera', 'camera', 'Bakgård', { recordingMode: 'on_event', clipSeconds: 60 }, { online: 0, status: 'offline', last_state: 'idle' }],

  ['sensor', 'temperature', 'Kjøleskap 1', { logIntervalMin: 15, min: 0, max: 4, criticalMargin: 2, mockMean: 3.1 }, { online: 1, status: 'ok', last_value: 3.1, battery: 88 }],
  ['sensor', 'temperature', 'Kjøleskap 2', { logIntervalMin: 15, min: 0, max: 4, criticalMargin: 2, mockMean: 4.7 }, { online: 1, status: 'warning', last_value: 4.7, battery: 74 }],
  ['sensor', 'temperature', 'Fryser', { logIntervalMin: 15, min: -25, max: -18, criticalMargin: 3, mockMean: -20.5 }, { online: 1, status: 'ok', last_value: -20.5, battery: 91 }],
  ['sensor', 'temperature', 'Kjølerom', { logIntervalMin: 15, min: 0, max: 4, criticalMargin: 2, mockMean: 2.4 }, { online: 1, status: 'ok', last_value: 2.4, battery: 65 }],

  ['detector', 'smoke', 'Røykvarsler Kjøkken', { armedSchedule: false, sensitivity: 'high' }, { online: 1, status: 'ok', last_state: 'clear', battery: 95 }],
  ['detector', 'smoke', 'Røykvarsler Spisesal', { armedSchedule: false, sensitivity: 'medium' }, { online: 1, status: 'ok', last_state: 'clear', battery: 90 }],
  ['detector', 'door', 'Hovedinngang', { armedSchedule: true, sensitivity: 'medium' }, { online: 1, status: 'warning', last_state: 'closed', battery: 12 }],
  ['detector', 'door', 'Bakdør', { armedSchedule: true, sensitivity: 'medium' }, { online: 1, status: 'ok', last_state: 'closed', battery: 80 }],
  ['detector', 'vibration', 'Vibrasjon Kasse', { armedSchedule: true, sensitivity: 'medium' }, { online: 1, status: 'ok', last_state: 'still', battery: 77 }],

  ['hub', 'hub', 'Aqara Hub M3', {}, { online: 1, status: 'ok', last_state: 'connected', last_value: 9 }],
];

const FIELDS: Record<string, string[]> = {
  camera: CAMERA_FIELDS,
  sensor: SENSOR_FIELDS,
  detector: DETECTOR_FIELDS,
  hub: HUB_FIELDS,
};

/** Insert mock devices once (only when the location has no devices yet). */
export function seedMockDevices(db: Database.Database, locationId: number) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM devices WHERE location_id = ?').get(locationId) as { n: number };
  if (n > 0) return;
  const insert = db.prepare(
    `INSERT INTO devices (location_id, category, kind, provider, external_id, channel_id, name, sort_order,
       visible_fields, settings, status, online, battery, last_value, last_state, last_seen)
     VALUES (@locationId, @category, @kind, 'mock', @externalId, '0', @name, @sortOrder,
       @fields, @settings, @status, @online, @battery, @last_value, @last_state, datetime('now'))`,
  );
  db.transaction(() => {
    MOCK.forEach(([category, kind, name, settings, state], i) => {
      insert.run({
        locationId,
        category,
        kind,
        externalId: `mock-${i + 1}`,
        name,
        sortOrder: i,
        fields: j(FIELDS[category]),
        settings: j(settings),
        battery: null,
        last_value: null,
        last_state: null,
        ...state,
      });
    });
    const ev = db.prepare('INSERT INTO events (location_id, type, severity, message) VALUES (?, ?, ?, ?)');
    ev.run(locationId, 'system', 'info', 'Mock devices loaded');
    ev.run(locationId, 'offline', 'warning', 'Bakgård camera went offline');
    ev.run(locationId, 'low_battery', 'warning', 'Hovedinngang door sensor battery low (12%)');
    ev.run(locationId, 'temp_out_of_range', 'warning', 'Kjøleskap 2 above limit: 4.7 °C (max 4 °C)');
  })();
}
