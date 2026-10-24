import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Alert, AlertSetup } from '../types';
import { ContactsCard } from '../components/alerts/ContactsCard';
import { RulesCard } from '../components/alerts/RulesCard';
import { AlertLog } from '../components/alerts/AlertLog';

function SetupNote({ s }: { s: AlertSetup }) {
  const items: { ok: boolean; text: string }[] = [
    { ok: s.twilio, text: s.twilio ? 'Phone calls: Twilio connected' : 'Phone calls are simulated — add TWILIO_* to .env' },
    { ok: s.whatsapp, text: s.whatsapp ? 'WhatsApp: connected' : 'WhatsApp is simulated — add WHATSAPP_FROM to .env' },
    {
      ok: s.whatsappTemplate || !s.whatsapp,
      text: s.whatsappTemplate ? 'WhatsApp template set' : 'No WhatsApp template (WHATSAPP_CONTENT_SID): alarms only reach people who messaged the number in the last 24 h',
    },
    {
      ok: s.callbacks,
      text: s.callbacks ? `“Press 1” and WhatsApp “OK” acknowledge via ${s.publicUrl}` : 'Acknowledge from phone/WhatsApp needs a public https PUBLIC_BASE_URL — until then, acknowledge on the dashboard',
    },
  ];
  return (
    <ul className="space-y-1 rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      {items.map((i) => (
        <li key={i.text} className="flex gap-2">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${i.ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span className={i.ok ? '' : 'text-zinc-600 dark:text-zinc-300'}>{i.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function AlertsPage({ alerts, flash }: { alerts: Alert[]; flash: (msg: string) => void }) {
  const [setup, setSetup] = useState<AlertSetup | null>(null);
  useEffect(() => {
    api.alertSetup().then(setSetup).catch(() => {});
  }, []);
  // reload the log whenever live alerts change
  const refreshKey = alerts.reduce((n, a) => n + a.id + a.escalationStep + a.status.length, 0);

  return (
    <div className="mx-auto grid max-w-6xl gap-6 p-4 lg:grid-cols-2">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Alerts & automations</h2>
          <p className="text-sm text-zinc-500">Who is called, in which order, and what happens on each event.</p>
        </div>
        {setup && <SetupNote s={setup} />}
        <ContactsCard flash={flash} />
        <RulesCard flash={flash} />
      </div>
      <div className="lg:pt-[4.5rem]">
        <AlertLog refreshKey={refreshKey} />
      </div>
    </div>
  );
}
