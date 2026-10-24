import type Database from 'better-sqlite3';
import { config } from '../config.js';

/** Idempotent: creates the pilot location, default schedule and default rules once. */
export function seed(db: Database.Database) {
  const existing = db.prepare('SELECT id FROM locations WHERE name = ?').get(config.locationName) as
    | { id: number }
    | undefined;
  if (existing) return;

  const tx = db.transaction(() => {
    const { lastInsertRowid: locationId } = db
      .prepare('INSERT INTO locations (name) VALUES (?)')
      .run(config.locationName);

    db.prepare('INSERT INTO arm_schedules (location_id) VALUES (?)').run(locationId);

    const rule = db.prepare(
      'INSERT INTO rules (location_id, name, trigger, conditions, actions, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const j = JSON.stringify;
    rule.run(locationId, 'Smoke detected', j({ event: 'smoke' }), j([]),
      j([{ type: 'record_all' }, { type: 'open_live_view' }, { type: 'alert', severity: 'critical' }]), 1);
    rule.run(locationId, 'Night intrusion', j({ event: ['door_open', 'vibration'] }), j([{ armed: true }]),
      j([{ type: 'record_all' }, { type: 'open_live_view' }, { type: 'alert', severity: 'critical' }]), 2);
    // Timing comes from each sensor's "warning after" / "critical after" settings
    rule.run(locationId, 'Temperature out of range', j({ event: 'temp_out_of_range' }), j([]),
      j([{ type: 'alert', severity: 'warning' }, { type: 'escalate', afterMin: 30, severity: 'critical' }]), 3);
    rule.run(locationId, 'Device offline / low battery', j({ event: ['offline', 'low_battery'] }), j([]),
      j([{ type: 'alert', severity: 'warning' }]), 4);
  });
  tx();
}
