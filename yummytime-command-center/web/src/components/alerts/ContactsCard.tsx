import { GripVertical, Phone, Plus, Send, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { Contact } from '../../types';
import { Btn, Field, NumberInput, Toggle, inputCls } from '../settings/fields';

type Draft = Omit<Contact, 'id'> & { id?: number };
const blank = (order: number): Draft => ({ name: '', phone: '', whatsapp: '', escalationOrder: order, waitMinutes: 5, receiveWarnings: true, enabled: true });

export function ContactsCard({ flash }: { flash: (msg: string) => void }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = () => api.contacts().then(setContacts).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!edit) return;
    try {
      await api.saveContact(edit);
      flash(`Saved ${edit.name}`);
      setEdit(null);
      setError(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async () => {
    if (!edit?.id) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    await api.deleteContact(edit.id);
    flash(`Removed ${edit.name}`);
    setEdit(null);
    load();
  };

  const test = async (c: Contact) => {
    flash(`Sending test to ${c.name}…`);
    try {
      const r = await api.testContact(c.id);
      const word = (s: { status: string; error?: string }) => (s.status === 'simulated' ? 'simulated (Twilio not set up)' : s.status === 'failed' ? `failed: ${s.error}` : 'sent');
      flash(`Test to ${c.name}: call ${word(r.call)}, WhatsApp ${word(r.whatsapp)}`);
    } catch (e) {
      flash((e as Error).message);
    }
  };

  const form = edit && (
    <div className="space-y-4 border-t border-zinc-200 p-4 dark:border-zinc-800">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name">
          <input id="contact-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Phone (calls)" hint="International format, e.g. +4791234567">
          <input id="contact-phone" type="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} className={inputCls} />
        </Field>
        <Field label="WhatsApp (if different)">
          <input id="contact-whatsapp" type="tel" value={edit.whatsapp ?? ''} onChange={(e) => setEdit({ ...edit, whatsapp: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Call order" hint="1 is called first">
          <NumberInput value={edit.escalationOrder} onChange={(v) => setEdit({ ...edit, escalationOrder: v })} />
        </Field>
        <Field label="Wait before next contact" hint="If not acknowledged">
          <NumberInput value={edit.waitMinutes} onChange={(v) => setEdit({ ...edit, waitMinutes: v })} suffix="min" />
        </Field>
        <div className="space-y-1 sm:pt-5">
          <Toggle label="Also receive warnings" checked={edit.receiveWarnings} onChange={(v) => setEdit({ ...edit, receiveWarnings: v })} />
          <Toggle label="Active" checked={edit.enabled} onChange={(v) => setEdit({ ...edit, enabled: v })} />
        </div>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Btn variant="primary" onClick={save}>
          Save
        </Btn>
        <Btn onClick={() => (setEdit(null), setError(null))}>Cancel</Btn>
        <span className="flex-1" />
        {edit.id && (
          <Btn variant="danger" onClick={remove}>
            <Trash2 size={16} /> {confirmDelete ? 'Tap again to delete' : 'Delete'}
          </Btn>
        )}
      </div>
    </div>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2 px-4 py-3">
        <Phone size={18} className="text-red-500" />
        <h3 className="flex-1 font-semibold">Who gets called</h3>
        {!edit && (
          <button onClick={() => setEdit(blank((contacts.at(-1)?.escalationOrder ?? 0) + 1))} className="flex items-center gap-1 text-sm font-medium text-orange-600 hover:underline dark:text-orange-400">
            <Plus size={16} /> Add contact
          </button>
        )}
      </div>
      <p className="px-4 pb-3 text-sm text-zinc-500">
        Critical alarm: call + WhatsApp to #1. Not acknowledged in time → #2, and so on (two rounds). Warnings: WhatsApp only.
      </p>
      {contacts.length === 0 && !edit && <p className="border-t border-zinc-200 px-4 py-3 text-sm text-red-600 dark:border-zinc-800">No contacts yet — nobody will be called.</p>}
      <ol>
        {contacts.map((c) => (
          <li key={c.id} className="border-t border-zinc-200 dark:border-zinc-800">
            <div className={`flex items-center gap-3 px-4 py-2.5 ${c.enabled ? '' : 'opacity-50'}`}>
              <GripVertical size={14} className="text-zinc-300" />
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold tabular-nums dark:bg-zinc-800">{c.escalationOrder}</span>
              <button onClick={() => setEdit({ ...c })} className="min-w-0 flex-1 text-left">
                <span className="block truncate font-medium">{c.name}</span>
                <span className="block text-xs text-zinc-500 tabular-nums">
                  {c.phone} · wait {c.waitMinutes} min{c.receiveWarnings ? ' · warnings' : ''}
                </span>
              </button>
              <button onClick={() => test(c)} title="Send a test call + WhatsApp" className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <Send size={14} /> Test
              </button>
            </div>
            {edit?.id === c.id && form}
          </li>
        ))}
      </ol>
      {edit && !edit.id && form}
    </div>
  );
}
