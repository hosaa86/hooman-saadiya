import * as repo from '../db/repo.js';
import { applyReading } from '../devices/ingest.js';
import { resolveAll } from '../alerts/service.js';
import { broadcast } from '../ws.js';
import { stopEventRecordings } from '../cameras/recorder.js';
import { armLocation } from '../rules/scheduler.js';
import { backdate, checkTemperature, resetTracking } from '../rules/temperature.js';

/**
 * Demo scenarios (MOCK_MODE): they only change device readings — the rules engine,
 * alerts and escalation react exactly as they would to real devices.
 */
export type Scenario = 'smoke' | 'intrusion' | 'temperature' | 'reset';

export function runScenario(s: Scenario) {
  const loc = repo.getLocation();
  const devices = repo.listDevices(loc.id);
  const find = (kind: string) => devices.find((d) => d.kind === kind && d.online);

  switch (s) {
    case 'smoke': {
      const d = find('smoke');
      if (!d) throw new Error('No online smoke detector');
      applyReading(d, { state: 'smoke' });
      return;
    }
    case 'intrusion': {
      const d = find('door');
      if (!d) throw new Error('No online door sensor');
      if (!loc.armed) armLocation(true, 'demo');
      applyReading(repo.getDevice(d.id)!, { state: 'open' });
      return;
    }
    case 'temperature': {
      const d = find('temperature');
      if (!d) throw new Error('No online temperature sensor');
      // 1 °C over the limit, as if it had been warm for the whole "warning after" time
      const value = Number(d.settings.max) + 1;
      const updated = applyReading(d, { value, state: 'forced' });
      backdate(d.id, Number(d.settings.warnAfterMin ?? 15));
      checkTemperature(updated);
      return;
    }
    case 'reset': {
      resolveAll();
      stopEventRecordings();
      for (const d of repo.listDevices(loc.id)) {
        if (d.kind === 'smoke' && d.lastState === 'smoke') applyReading(d, { state: 'clear' });
        if (d.kind === 'door' && d.lastState === 'open') applyReading(d, { state: 'closed' });
        if (d.kind === 'temperature' && d.lastState === 'forced') {
          resetTracking(d.id);
          applyReading(d, { state: null, value: Number(d.settings.mockMean ?? (Number(d.settings.min) + Number(d.settings.max)) / 2) });
          repo.updateDeviceState(d.id, { lastState: null });
        }
      }
      if (loc.armed && loc.armedBy === 'demo') armLocation(false, 'demo');
      broadcast({ type: 'event', event: repo.addEvent(loc.id, { type: 'system', severity: 'info', message: 'Demo reset – all clear' }) });
      return;
    }
  }
}
