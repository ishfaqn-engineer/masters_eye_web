import React, { useEffect, useState } from 'react';
import {
  Activity, Users, Smartphone, Wifi, KeyRound, ScrollText, RefreshCw, Download,
  RotateCcw, Upload, ShieldCheck, Server, Save, Cloud,
} from 'lucide-react';
import { AppState, APP_VERSION, APP_CODE, normalizeState, blankState } from '../store';
import { Field, inputCls, StatCard, Modal } from '../components/ui';
import { exportExcel } from '../lib/exporters';
import {
  readMasterKey, writeMasterKey, getServerUrl, setServerUrl, call, ping, fetchLogs, fetchStats, fetchUsers,
  resetPassword, setUpdate, backupState, restoreState, syncDirectory,
  ServerLog, ServerStats, ServerAccount, UpdateInfo, checkUpdate,
} from '../lib/server';

/* master-only control centre: server link + admin key, live stats, login
   logs, the users table (reset password / Excel export), backup and the
   update manifest. Every admin op carries the key saved here. */
export default function Console({ state, setState }: { state: AppState; setState: (s: AppState) => void }) {
  const [key, setKey] = useState(readMasterKey());
  const [url, setUrl] = useState(getServerUrl(state) || state.settings.serverUrl);
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [logs, setLogs] = useState<ServerLog[]>([]);
  const [users, setUsers] = useState<ServerAccount[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetFor, setResetFor] = useState<ServerAccount | null>(null);
  const [newPin, setNewPin] = useState('');
  const [upd, setUpd] = useState<UpdateInfo | null>(null);
  const [updDraft, setUpdDraft] = useState({ latest: '', code: '', url: '', notes: '' });

  const adminCall = async (label: string, fn: () => Promise<any>) => {
    setBusy(true); setMsg('');
    try {
      if (!getServerUrl()) { setMsg('✗ Save the server link first.'); return; }
      if (!readMasterKey()) { setMsg('✗ Save the admin key first.'); return; }
      const res = await fn();
      setMsg(res.ok ? `✓ ${label}` : `✗ ${res.error || 'failed'}`);
      return res;
    } finally { setBusy(false); }
  };

  const refresh = async () => {
    const res = await adminCall('Loaded', async () => {
      const [s, l, u] = await Promise.all([fetchStats(readMasterKey()), fetchLogs(readMasterKey(), 60), fetchUsers(readMasterKey())]);
      if (!s.ok) return s;
      setStats(s.stats || null);
      setLogs(l.logs || []);
      setUsers(u.users || []);
      return s;
    });
    return res;
  };

  useEffect(() => {
    if (getServerUrl(state) && readMasterKey()) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveServer = async () => {
    const v = url.trim();
    setServerUrl(v);
    setState({ ...state, settings: { ...state.settings, serverUrl: v } });
    if (v && readMasterKey()) {
      const p = await ping();
      setMsg(p.ok ? '✓ Server link saved and reachable.' : `✗ Link saved, but: ${p.error}`);
    } else setMsg('✓ Server link saved.');
  };

  const saveKey = async () => {
    const k = key.trim();
    if (k.length < 4) { setMsg('✗ Admin key must be at least 4 characters.'); return; }
    setBusy(true);
    try {
      const res = await call({ op: 'setupkey', masterKey: k });
      if (res.ok) {
        writeMasterKey(k);
        await refresh();
        setMsg('✓ Admin key saved (stored on this device + the sheet).');
      } else setMsg(`✗ ${res.error}`);
    } catch (e: any) {
      setMsg(`✗ ${String(e?.message || e)}`);
    } finally { setBusy(false); }
  };

  const doReset = async () => {
    if (!resetFor) return;
    if (!/^\d{4,6}$/.test(newPin)) { setMsg('✗ New PIN must be 4 to 6 digits.'); return; }
    const res = await adminCall(`Password reset for ${resetFor.username}`, () =>
      resetPassword(readMasterKey(), resetFor.username, newPin));
    if (res && res.ok) { setResetFor(null); setNewPin(''); refresh(); }
  };

  const doExport = () => {
    const rows: (string | number)[][] = [
      ['Username', 'Name', 'Role', 'Created', 'Last seen', 'PIN hash'],
      ...users.map(u => [u.username, u.name, u.role, u.created || '', u.lastSeen || '', u.pinHash]),
    ];
    exportExcel(rows, `masters-eye-users-${new Date().toISOString().slice(0, 10)}.xlsx`, 'Users');
    setMsg('✓ Users exported — pick your Drive folder in the save dialog.');
  };

  const doBackup = async () => {
    const me = state.accounts.find(a => a.username);
    const who = me?.username || users[0]?.username || 'org';
    const res = await adminCall(`Backup pushed for ${who}`, () => backupState(who, state));
    return res;
  };

  const doRestore = async () => {
    const me = state.accounts.find(a => a.username);
    const who = me?.username || users[0]?.username;
    if (!who) { setMsg('✗ No username to restore from.'); return; }
    if (!confirm('Replace ALL current data with the server backup?')) return;
    const res = await adminCall(`Restored ${who}`, async () => {
      const r = await restoreState(who);
      if (!r.ok) return r;
      if ((r.data as any)?.v !== 2) return { ok: false, error: 'That backup is not a Master\'s Eye v2 file.' };
      setState(normalizeState(r.data, blankState()));
      await syncDirectory();
      return r;
    });
    if (res && res.ok) setMsg('✓ Restored from the server backup.');
  };

  const checkManifest = async () => {
    const res = await adminCall('Update manifest saved', () =>
      setUpdate(readMasterKey(), updDraft.latest, Number(updDraft.code) || 0, updDraft.url, updDraft.notes));
    if (res && res.ok) setUpd({ latest: updDraft.latest, url: updDraft.url, notes: updDraft.notes });
  };

  const loadUpdate = async () => {
    const res = await checkUpdate(APP_CODE);
    if (res.ok && res.update) { setUpd(res.update); setUpdDraft({ latest: res.update.latest, code: '', url: res.update.url, notes: res.update.notes }); }
    else setMsg(res.ok ? '✓ No newer version published.' : `✗ ${res.error}`);
  };

  const online = stats?.online ?? 0;

  return (
    <div className="p-4 space-y-4">
      {/* ── connection ─────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow p-4">
        <div className="flex items-center gap-2 font-black uppercase text-sm mb-3">
          <Server size={16} className="text-wood" /> Server connection
        </div>
        <Field label="Apps Script /exec link">
          <input className={inputCls + ' text-sm'} value={url} onChange={e => setUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/…/exec" autoComplete="off" />
        </Field>
        <button onClick={saveServer}
          className="w-full py-3 rounded-2xl bg-blue-600 text-white font-black uppercase text-xs active:scale-95 flex items-center justify-center gap-2 mb-3">
          <Save size={15} /> Save link
        </button>
        <Field label="Admin key (guards reset / logs / export)">
          <input className={inputCls + ' text-sm'} type="password" value={key} onChange={e => setKey(e.target.value)}
            placeholder="choose a key — min 4 characters" autoComplete="off" />
        </Field>
        <button onClick={saveKey}
          className="w-full py-3 rounded-2xl bg-wood text-white font-black uppercase text-xs active:scale-95 flex items-center justify-center gap-2">
          <KeyRound size={15} /> Save admin key
        </button>
        {msg && <div className="text-xs font-black mt-2 text-center text-gray-600">{msg}</div>}
      </div>

      {/* ── live stats ─────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 font-black uppercase text-sm">
            <Activity size={16} className="text-wood" /> Live stats
          </div>
          <button onClick={refresh} disabled={busy} title="Refresh"
            className="p-2 bg-gray-100 rounded-xl active:scale-90">
            <RefreshCw size={15} className={busy ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Online" value={online} sub="last 5 min" />
          <StatCard label="Installs" value={stats?.installs ?? '—'} sub="devices" />
          <StatCard label="Users" value={stats?.users ?? '—'} sub="accounts" />
          <StatCard label="Logins 7d" value={stats?.logins7d ?? '—'} sub={stats ? `${stats.loginsToday} today` : 'loading'} />
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px] font-bold text-gray-400 uppercase">
          <Wifi size={13} className={online ? 'text-green-500' : 'text-gray-300'} />
          {online ? `${online} device${online > 1 ? 's' : ''} online now` : 'nobody online right now'}
        </div>
      </div>

      {/* ── users ──────────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 font-black uppercase text-sm">
            <Users size={16} className="text-wood" /> Users
          </div>
          <div className="flex gap-2">
            <button onClick={doExport} disabled={!users.length}
              className="flex items-center gap-1 text-xs font-black uppercase text-wood bg-wood/10 px-3 py-2 rounded-xl active:scale-95 disabled:opacity-40">
              <Download size={14} /> Excel
            </button>
          </div>
        </div>
        <div className="text-xs text-gray-400 font-bold mb-3">Every signup on this server — reset a password or export the table.</div>
        <div className="space-y-2">
          {!users.length && <div className="text-xs font-bold text-gray-400 text-center py-2">No users loaded yet — press Refresh above.</div>}
          {users.map(u => (
            <div key={u.id} className="flex items-center gap-3 border-2 border-gray-100 rounded-2xl p-2.5">
              <div className="w-10 h-10 rounded-full bg-wood/10 flex items-center justify-center shrink-0">
                <ShieldCheck size={18} className="text-wood" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-black uppercase truncate">{u.name}</div>
                <div className="text-[11px] font-bold text-gray-400 uppercase truncate">
                  @{u.username} · {u.role} · {u.lastSeen ? `seen ${u.lastSeen.slice(0, 16).replace('T', ' ')}` : 'never'}
                </div>
              </div>
              <button onClick={() => { setResetFor(u); setNewPin(''); }}
                title="Reset password" className="p-2 bg-red-50 rounded-lg active:scale-90">
                <RotateCcw size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── login logs ─────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow p-4">
        <div className="flex items-center gap-2 font-black uppercase text-sm mb-3">
          <ScrollText size={16} className="text-wood" /> Login log
        </div>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {!logs.length && <div className="text-xs font-bold text-gray-400 text-center py-2">Nothing logged yet.</div>}
          {logs.map((l, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px] font-bold border-b border-gray-50 pb-1">
              <span className="text-gray-400 w-24 shrink-0">{l.t ? l.t.slice(5, 16).replace('T', ' ') : ''}</span>
              <span className="font-black uppercase truncate flex-1">{l.user}</span>
              <span className={`uppercase ${l.result === 'ok' ? 'text-green-600' : 'text-red-500'} truncate`}>{l.result}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── backup / restore ───────────────────────── */}
      <div className="bg-white rounded-3xl shadow p-4">
        <div className="flex items-center gap-2 font-black uppercase text-sm mb-3">
          <Cloud size={16} className="text-blue-600" /> Cloud backup
        </div>
        <div className="text-xs text-gray-400 font-bold mb-3">
          State goes to a JSON file in your Drive (photos stripped to keep it light). Auto-push runs 15s after
          every change while you are logged in — this is the manual pair.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={doBackup} disabled={busy}
            className="py-3 rounded-2xl bg-blue-600 text-white font-black uppercase text-xs active:scale-95 flex items-center justify-center gap-2">
            <Upload size={15} /> Backup now
          </button>
          <button onClick={doRestore} disabled={busy}
            className="py-3 rounded-2xl bg-gray-100 font-black uppercase text-xs active:scale-95 flex items-center justify-center gap-2">
            <Download size={15} /> Restore
          </button>
        </div>
      </div>

      {/* ── update manifest ────────────────────────── */}
      <div className="bg-white rounded-3xl shadow p-4">
        <div className="flex items-center gap-2 font-black uppercase text-sm mb-3">
          <Smartphone size={16} className="text-wood" /> Updates
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <StatCard label="Installed" value={`v${APP_VERSION}`} sub={`code ${APP_CODE}`} />
          <StatCard label="Published" value={upd ? upd.latest : '—'} sub="on server" />
        </div>
        <button onClick={loadUpdate} disabled={busy}
          className="w-full py-3 rounded-2xl bg-gray-100 font-black uppercase text-xs active:scale-95 mb-3">
          Check for a newer version
        </button>
        <div className="border-t border-gray-100 pt-3">
          <div className="text-[11px] font-black uppercase text-gray-400 mb-2">Publish an update (tells every device)</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Version">
              <input className={inputCls + ' text-sm'} value={updDraft.latest} onChange={e => setUpdDraft({ ...updDraft, latest: e.target.value })} placeholder="2.1.0" />
            </Field>
            <Field label="Code">
              <input className={inputCls + ' text-sm'} value={updDraft.code} onChange={e => setUpdDraft({ ...updDraft, code: e.target.value.replace(/\D/g, '') })} placeholder="12" inputMode="numeric" />
            </Field>
          </div>
          <Field label="Download URL (APK / Play link)">
            <input className={inputCls + ' text-sm'} value={updDraft.url} onChange={e => setUpdDraft({ ...updDraft, url: e.target.value })} placeholder="https://github.com/…" />
          </Field>
          <Field label="What's new">
            <input className={inputCls + ' text-sm'} value={updDraft.notes} onChange={e => setUpdDraft({ ...updDraft, notes: e.target.value })} placeholder="Money pack, bug fixes…" />
          </Field>
          <button onClick={checkManifest} disabled={busy}
            className="w-full py-3 rounded-2xl bg-wood text-white font-black uppercase text-xs active:scale-95 flex items-center justify-center gap-2">
            <Save size={15} /> Publish update info
          </button>
        </div>
      </div>

      {/* ── reset password modal ───────────────────── */}
      <Modal open={!!resetFor} onClose={() => setResetFor(null)} title={`Reset @${resetFor?.username || ''}`}>
        <div className="text-xs font-bold text-gray-400 mb-3">
          Type a new 4–6 digit PIN. It overwrites the password on the server — tell the user the new one.
        </div>
        <Field label="New PIN">
          <input className={inputCls + ' text-center tracking-[0.5em]'} type="password" inputMode="numeric"
            maxLength={6} value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
        </Field>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <button onClick={() => setResetFor(null)} className="py-4 rounded-2xl bg-gray-100 font-black uppercase active:scale-95">Cancel</button>
          <button onClick={doReset} disabled={busy} className="py-4 rounded-2xl bg-red-600 text-white font-black uppercase active:scale-95">Reset</button>
        </div>
      </Modal>
    </div>
  );
}
