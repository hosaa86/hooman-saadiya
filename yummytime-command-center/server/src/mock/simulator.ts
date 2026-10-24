import { getDb } from '../db/index.js';
import * as repo from '../db/repo.js';
import { broadcast } from '../ws.js';
import { temperatureStatus, type SensorLimits } from '../status.js';
import { seedMockDevices } from './devices.js';

const TICK_MS = 5000;
const lastLogged = new Map<number, number>();

/** Drift mock temperatures every few seconds and log readings at each sensor's interval. */
export function startMockSimulator() {
  const location = repo.getLocation();
  seedMockDevices(getDb(), location.id);

  setInterval(() => {
    const now = Date.now();
    for (const d of repo.listDevices(location.id)) {
      if (d.kind !== 'temperature' || !d.online) continue;
      const s = d.settings as unknown as SensorLimits & { mockMean: number; logIntervalMin: number };
      // Readings forced by a scenario (no mockMean pull) stay put until reset
      if (d.lastState === 'forced') continue;
      const prev = d.lastValue ?? s.mockMean;
      const next = Math.round((prev + (s.mockMean - prev) * 0.3 + (Math.random() - 0.5) * 0.3) * 10) / 10;
      const updated = repo.updateDeviceState(d.id, { lastValue: next, status: temperatureStatus(next, s) });
      broadcast({ type: 'device_update', device: updated });

      if (now - (lastLogged.get(d.id) ?? 0) >= s.logIntervalMin * 60_000) {
        repo.addTemperatureReading(d.id, next, s.min, s.max);
        lastLogged.set(d.id, now);
      }
    }
  }, TICK_MS);
}
