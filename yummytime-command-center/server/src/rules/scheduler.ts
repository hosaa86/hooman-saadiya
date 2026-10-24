import { config } from '../config.js';
import * as repo from '../db/repo.js';
import { refreshArmedStatus } from '../devices/ingest.js';
import { broadcast } from '../ws.js';
import type { Location } from '../types.js';

/** Arm or disarm the location (dashboard button, schedule, or demo) and tell every dashboard. */
export function armLocation(armed: boolean, by: string): Location {
  const location = repo.setArmed(armed, by);
  broadcast({ type: 'location', location });
  refreshArmedStatus(location.id);
  broadcast({
    type: 'event',
    event: repo.addEvent(location.id, { type: armed ? 'armed' : 'disarmed', severity: 'info', message: `${armed ? 'Armed' : 'Disarmed'} by ${by}` }),
  });
  return location;
}

/** Weekday (1 = Monday) and HH:MM in the location's time zone. */
export function localNow(date = new Date(), timeZone = config.timezone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1;
  return { weekday, time: `${parts.hour}:${parts.minute}` };
}

let lastRun = '';

/** Night mode: arm at armTime on the chosen days; disarm at disarmTime if the schedule armed it. */
export function tickSchedule(date = new Date()) {
  const loc = repo.getLocation();
  const s = repo.getSchedule(loc.id);
  const { weekday, time } = localNow(date);
  const key = `${date.toISOString().slice(0, 10)} ${time}`;
  if (!s.enabled || key === lastRun) return;
  if (time === s.armTime && s.days.includes(weekday) && !loc.armed) {
    lastRun = key;
    armLocation(true, 'schedule');
  } else if (time === s.disarmTime && loc.armed && loc.armedBy === 'schedule') {
    lastRun = key;
    armLocation(false, 'schedule');
  }
}

export function startScheduler() {
  setInterval(() => tickSchedule(), 20_000);
}
