import { Phone, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Alert, Contact } from '../types';

/** "Call back": the alert contacts as tap-to-call links. */
export function CallBackSheet({ alert, onClose }: { alert: Alert; onClose: () => void }) {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  useEffect(() => {
    api.contacts().then((c) => setContacts(c.filter((x) => x.enabled)), () => setContacts([]));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Call back" className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Call back</p>
            <p className="truncate text-sm text-zinc-500">{alert.title}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X size={18} />
          </button>
        </div>
        {contacts?.length === 0 && <p className="text-sm text-zinc-500">No contacts yet. Add them under Alerts.</p>}
        <ul className="space-y-2">
          {contacts?.map((c) => (
            <li key={c.id}>
              <a href={`tel:${c.phone}`} className="flex items-center gap-3 rounded-xl bg-zinc-100 px-3 py-3 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700">
                <Phone size={18} className="text-emerald-600" />
                <span className="flex-1 font-medium">{c.name}</span>
                <span className="select-all text-sm text-zinc-500 tabular-nums">{c.phone}</span>
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            ['110', 'Fire brigade 110'],
            ['112', 'Police 112'],
          ].map(([n, label]) => (
            <a key={n} href={`tel:${n}`} className="rounded-xl border border-red-300 px-3 py-2.5 text-center text-sm font-semibold text-red-700 dark:border-red-500/40 dark:text-red-300">
              {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
