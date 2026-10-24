import { Link2, RefreshCw, Unplug } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { AqaraStatus } from '../../types';
import { timeAgo } from '../ui';
import { Btn, Field, inputCls } from './fields';

/** Aqara account connection: Aqara emails/texts a verification code to the account. */
export function AqaraCard({ flash }: { flash: (msg: string) => void }) {
  const [s, setS] = useState<AqaraStatus | null>(null);
  const [account, setAccount] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .aqaraStatus()
      .then((st) => {
        setS(st);
        setAccount((a) => a || st.account || '');
      })
      .catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!s) return null;
  const syncMsg = (r: { found: number; added: string[]; unsupported: string[] }) =>
    `Aqara: ${r.found} devices found, ${r.added.length} added${r.unsupported.length ? ` · not supported: ${r.unsupported.join(', ')}` : ''}`;

  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <Link2 size={18} className="text-sky-500" />
        <h3 className="flex-1 font-semibold">Aqara account</h3>
        <span className={`text-xs font-medium ${s.connected && !s.lastError ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500'}`}>
          {!s.configured ? 'Not set up' : s.connected ? (s.lastError ? 'Connection problem' : 'Connected') : 'Not connected'}
        </span>
      </div>

      {!s.configured && (
        <p className="text-sm text-zinc-500">
          Add <code>AQARA_APP_ID</code>, <code>AQARA_KEY_ID</code> and <code>AQARA_APP_KEY</code> from the approved “DEMO APPLICATION” project to <code>.env</code>, then restart the app.
        </p>
      )}

      {s.configured && !s.connected && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-500">Aqara sends a verification code to the account’s email or phone.</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Field label="Aqara account (email or phone)">
              <input id="aqara-account" value={account} onChange={(e) => setAccount(e.target.value)} className={inputCls} />
            </Field>
            <div className="flex items-end">
              <Btn disabled={busy || !account} onClick={() =>
                  run(async () => {
                    await api.aqaraSendCode(account);
                    setCodeSent(true);
                    flash('Code sent — check email/phone');
                  })
                }>
                {codeSent ? 'Send again' : 'Send code'}
              </Btn>
            </div>
          </div>
          {codeSent && (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Field label="Verification code">
                <input id="aqara-code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} className={inputCls} />
              </Field>
              <div className="flex items-end">
                <Btn variant="primary" disabled={busy || !code} onClick={() => run(async () => flash(syncMsg((await api.aqaraConnect(account, code)).sync)))}>
                  Connect
                </Btn>
              </div>
            </div>
          )}
        </div>
      )}

      {s.connected && (
        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-zinc-500">Account</dt>
              <dd className="truncate font-medium">{s.account}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Devices</dt>
              <dd className="font-medium">{s.deviceCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Last read</dt>
              <dd className="font-medium">{timeAgo(s.lastPollAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Reads every</dt>
              <dd className="font-medium">{s.pollSec} s</dd>
            </div>
          </dl>
          {s.lastError && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">{s.lastError}</p>}
          <div className="flex flex-wrap gap-2">
            <Btn disabled={busy} onClick={() => run(async () => flash(syncMsg(await api.aqaraSync())))}>
              <RefreshCw size={16} /> Sync devices
            </Btn>
            <Btn variant="danger" disabled={busy} onClick={() => run(() => api.aqaraDisconnect())}>
              <Unplug size={16} /> Disconnect
            </Btn>
          </div>
        </div>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
    </div>
  );
}
