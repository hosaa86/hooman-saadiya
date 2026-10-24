import { getDb } from '../db/index.js';
import * as repo from '../db/repo.js';
import { applyReading } from '../devices/ingest.js';
import { seedMockDevices } from './devices.js';

const TICK_MS = 5000;

/** Drift mock temperatures every few seconds (logged and checked like real readings). */
export function startMockSimulator() {
  const location = repo.getLocation();
  seedMockDevices(getDb(), location.id);

  setInterval(() => {
    for (const d of repo.listDevices(location.id)) {
      if (d.provider !== 'mock' || d.kind !== 'temperature' || !d.online) continue;
      // Readings forced by a demo scenario stay put until reset
      if (d.lastState === 'forced') {
        applyReading(d, {});
        continue;
      }
      const mean = Number(d.settings.mockMean ?? (Number(d.settings.min) + Number(d.settings.max)) / 2);
      const prev = d.lastValue ?? mean;
      const next = Math.round((prev + (mean - prev) * 0.3 + (Math.random() - 0.5) * 0.3) * 10) / 10;
      applyReading(d, { value: next });
    }
  }, TICK_MS);
}
