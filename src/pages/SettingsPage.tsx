import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Trash2, RefreshCw, Phone, Pencil, Upload, Users, HardDrive, Info, LogOut, KeyRound, Cloud, Plus, ShieldCheck, Server, Smartphone, Download } from 'lucide-react';
import { AppState, Account, Role, blankState, normalizeState, Worker, APP_VERSION, APP_CODE } from '../store';
import { money, Modal, Field, inputCls, PhotoInput, MoneyField, StatCard, WhatsAppBtn } from '../components/ui';
import { clearFiles } from '../lib/files';
import { hashPin, makeAccount, verifyPin } from '../lib/auth';
import {
  getServerUrl, setServerUrl, ping, backupState, restoreState, syncDirectory, checkUpdate, changePassword, UpdateInfo,
} from '../lib/server';

type Props = {
  state: AppState;
  setState: (s: AppState) => void;
  sync: () => void;
  syncing: boolean;
  account: Account | null;
  role: Role;
  onLogout: () => void;
  onConsole: () => void;
};

const roleLabel: Record<Role, string> = { master: 'Master', vendor: 'Vendor', team: 'Team member', client: 'Client', user: 'Member' };

export default function SettingsPage({ state, setState, sync, syncing, account, role, onLogout, onConsole }: Props) {
  const isMaster = role === 'master';
  const [editMaster, setEditMaster] = useState(false);
  const [draft, setDraft] = useState({ name: state.settings.masterName, photo: state.settings.masterPhoto, rate: state.settings.masterRate });
  const [wa, setWa] = useState(state.settings.whatsappNumber);
  const [rateEdit, setRateEdit] = useState<Worker | 'master' | null>(null);
  const [rateDraft, setRateDraft] = useState({ name: '', photo: '', rate: 0, phone: '' });
  const restoreRef = useRef<HTMLInputElement>(null);

  // accounts
  const [addOpen, setAddOpen] = useState(false);
  const [accDraft, setAccDraft] = useState({ name: '', role: 'vendor' as Role, pin: '', vendorId: '', workerId: '', clientId: '' });
  const blankAccDraft = () => ({ name: '', role: 'vendor' as Role, pin: '', vendorId: '', workerId: '', clientId: '' });

  // cloud server (master)
  const [srvUrl, setSrvUrl] = useState(getServerUrl(state) || state.settings.serverUrl);
  const [support, setSupport] = useState(state.settings.supportEmail);
  const [srvMsg, setSrvMsg] = useState('');
  const [upd, setUpd] = useState<UpdateInfo | null>(null);

  useEffect(() => { setWa(state.settings.whatsappNumber); }, [state.settings.whatsappNumber]);

  useEffect(() => {
    if (!isMaster) return;
    let dead = false;
    checkUpdate(APP_CODE).then(r => { if (!dead && r.ok && r.update) setUpd(r.update); }).catch(() => { /* offline */ });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── profile / rates / whatsapp (master) ─────────────────── */
  const saveMaster = () => {
    setState({ ...state, settings: { ...state.settings, masterName: draft.name || 'Master', masterPhoto: draft.photo, masterRate: Math.max(0, draft.rate) } });
    setEditMaster(false);
  };
  const saveWa = () => setState({ ...state, settings: { ...state.settings, whatsappNumber: wa.replace(/\D/g, '') } });

  const openRate = (t: Worker | 'master') => {
    if (t === 'master') setRateDraft({ name: state.settings.masterName, photo: state.settings.masterPhoto, rate: state.settings.masterRate, phone: '' });
    else setRateDraft({ name: t.name, photo: t.photo, rate: t.rate, phone: t.phone || '' });
    setRateEdit(t);
  };
  const saveRate = () => {
    if (!rateEdit) return;
    if (rateEdit === 'master') {
      setState({ ...state, settings: { ...state.settings, masterName: rateDraft.name || 'Master', masterPhoto: rateDraft.photo, masterRate: Math.max(0, rateDraft.rate) } });
    } else {
      setState({
        ...state,
        workers: state.workers.map(w => w.id === (rateEdit as Worker).id
          ? { ...w, name: rateDraft.name || w.name, photo: rateDraft.photo, rate: Math.max(0, rateDraft.rate), phone: rateDraft.phone.replace(/\D/g, '') }
          : w)
      });
    }
    setRateEdit(null);
  };

  /* ── accounts ────────────────────────────────────────────── */
  const addAccount = async () => {
    if (!accDraft.name.trim()) { alert('Type a name.'); return; }
    if (!/^\d{4,6}$/.test(accDraft.pin)) { alert('PIN must be 4 to 6 digits.'); return; }
    if (accDraft.role === 'vendor' && !accDraft.vendorId) { alert('Pick which vendor this login belongs to.'); return; }
    if (accDraft.role === 'team' && !accDraft.workerId) { alert('Pick which crew member this login belongs to.'); return; }
    if (accDraft.role === 'client' && !accDraft.clientId) { alert('Pick which client this login belongs to.'); return; }
    const photo = accDraft.role === 'vendor'
      ? state.vendors.find(v => v.id === accDraft.vendorId)?.photo
      : accDraft.role === 'client'
        ? state.clients.find(c => c.id === accDraft.clientId)?.photo
        : state.workers.find(w => w.id === accDraft.workerId)?.photo;
    const acc = await makeAccount({
      name: accDraft.name.trim(), role: accDraft.role, pin: accDraft.pin,
      vendorId: accDraft.role === 'vendor' ? accDraft.vendorId : undefined,
      workerId: accDraft.role === 'team' ? accDraft.workerId : undefined,
      clientId: accDraft.role === 'client' ? accDraft.clientId : undefined,
      photo,
    });
    setState({ ...state, accounts: [...state.accounts, acc] });
    setAddOpen(false);
    setAccDraft(blankAccDraft());
  };

  const removeAccount = (acc: Account) => {
    if (acc.id === account?.id) { alert('You cannot remove the account you are logged in with.'); return; }
    if (!confirm(`Remove login for ${acc.name}? Their data stays in the app.`)) return;
    setState({ ...state, accounts: state.accounts.filter(a => a.id !== acc.id) });
  };

  const changePin = async (acc: Account) => {
    // changing your OWN pin requires proving the current one first
    let provedPin = '';
    if (acc.id === account?.id) {
      const oldPin = prompt('Enter your CURRENT PIN:') || '';
      if (!oldPin) return;
      if (!(await verifyPin(acc, oldPin))) { alert('Current PIN is wrong.'); return; }
      provedPin = oldPin;
    }
    const pin = prompt(`New 4–6 digit PIN for ${acc.name}:`) || '';
    if (!/^\d{4,6}$/.test(pin)) { if (pin) alert('PIN must be 4 to 6 digits.'); return; }
    const salt = acc.username || acc.id;
    const pinHash = await hashPin(pin, salt);
    setState({ ...state, accounts: state.accounts.map(a => a.id === acc.id ? { ...a, pinHash } : a) });
    // a server-registered login must change the password in both places
    if (acc.username && provedPin && getServerUrl(state)) {
      changePassword(acc.username, provedPin, pin).catch(() => { /* offline */ });
    }
    alert('PIN changed.');
  };

  const setupMaster = async () => {
    const pin = prompt('Choose a 4–6 digit PIN for the master login:') || '';
    if (!/^\d{4,6}$/.test(pin)) { if (pin) alert('PIN must be 4 to 6 digits.'); return; }
    const acc = await makeAccount({ name: state.settings.masterName, role: 'master', pin, photo: state.settings.masterPhoto });
    setState({ ...state, accounts: [acc] });
    alert('Login created. It switches on the next time the app opens.');
  };

  /* ── cloud server ───────────────────────────────────────── */
  const saveServer = async () => {
    const v = srvUrl.trim();
    setServerUrl(v);
    setState({ ...state, settings: { ...state.settings, serverUrl: v, supportEmail: support.trim() } });
    if (!v) { setSrvMsg('Server link cleared — running local only.'); return; }
    const res = await ping();
    setSrvMsg(res.ok ? '✓ Saved — server reachable.' : `✗ Saved, but: ${res.error}`);
  };

  const saveSupport = () =>
    setState({ ...state, settings: { ...state.settings, supportEmail: support.trim() } });

  // shared org backup key: a server username if one exists here, else "org"
  const cloudUser = () => account?.username || state.accounts.find(a => a.username)?.username || 'org';

  const doCloudPush = async () => {
    const who = cloudUser();
    if (!who) { setSrvMsg('✗ No server-registered login on this device — sign up with a username first.'); return; }
    setSrvMsg('Pushing to your Drive…');
    const res = await backupState(who, state);
    setSrvMsg(res.ok ? `✓ Backed up at ${new Date().toLocaleTimeString()}` : `✗ ${res.error}`);
  };

  const doCloudPull = async () => {
    const who = cloudUser();
    if (!who) { setSrvMsg('✗ No server-registered login on this device.'); return; }
    if (!confirm('Replace ALL current data with the copy from the server?')) return;
    setSrvMsg('Downloading from your Drive…');
    const res = await restoreState(who);
    if (!res.ok) { setSrvMsg(`✗ ${res.error}`); return; }
    if (res.data?.v !== 2) { setSrvMsg('✗ That copy is not a Master\'s Eye v2 backup.'); return; }
    const next = normalizeState(res.data, blankState());
    // only the master may replace logins — a vendor / team / client pull must
    // never rewrite the account list (auth hardening from 9529829)
    setState(isMaster ? next : { ...next, accounts: state.accounts });
    await syncDirectory().catch(() => { /* offline */ });
    setSrvMsg('✓ Restored from the server.');
  };

  /* ── data ────────────────────────────────────────────────── */
  const onRestoreFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const parsed = JSON.parse(await f.text());
      if (parsed?.v !== 2) { alert('That is not a Master\'s Eye backup file.'); return; }
      if (!confirm('Replace ALL current data with this backup? Current records will be lost.')) return;
      setState(normalizeState(parsed, blankState()));
      alert('Backup restored.');
    } catch {
      alert('That file could not be read as a backup.');
    }
  };

  const reset = () => {
    if (!confirm('Erase ALL data and start completely fresh? This cannot be undone.')) return;
    if (!confirm('Really reset? This deletes every client, order, payment and wage record.')) return;
    // records go, logins stay — otherwise the master locks themselves out of the wipe
    setState({ ...blankState(), accounts: state.accounts });
    clearFiles().catch(() => { /* best effort */ });
  };

  const crewRows = [
    { id: 'master' as const, name: state.settings.masterName, photo: state.settings.masterPhoto, rate: state.settings.masterRate },
    ...state.workers
  ];

  return (
    <div className="p-4 space-y-4">
      {/* ── Account (all roles) ─────────────── */}
      <div className="bg-white rounded-3xl shadow p-4">
        <div className="font-black uppercase text-sm mb-3">My account</div>
        <div className="flex items-center gap-4">
          <img src={(account?.photo || (isMaster ? state.settings.masterPhoto : '')) || `https://i.pravatar.cc/300?u=${account?.id || 'master'}`}
            className="w-20 h-20 rounded-full object-cover" alt="" />
          <div className="flex-1 min-w-0">
            <div className="font-black uppercase text-lg truncate">{account?.name || state.settings.masterName}</div>
            <div className="text-sm font-bold text-gray-400">{account ? roleLabel[account.role] : 'No login yet'}</div>
            {isMaster && <div className="text-sm font-bold text-gray-400">₹{money(state.settings.masterRate)}/day</div>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          {account && (
            <button onClick={() => changePin(account)} className="py-3 rounded-2xl bg-gray-100 font-black uppercase text-xs active:scale-95 flex items-center justify-center gap-2">
              <KeyRound size={16} /> Change PIN
            </button>
          )}
          <button onClick={onLogout} className="py-3 rounded-2xl bg-gray-900 text-white font-black uppercase text-xs active:scale-95 flex items-center justify-center gap-2">
            <LogOut size={16} /> Log out
          </button>
        </div>
      </div>

      {isMaster && (
        <>
          {/* ── Master profile ─────────────────── */}
          <div className="bg-white rounded-3xl shadow p-4">
            <div className="font-black uppercase text-sm mb-3">Master profile</div>
            <div className="flex items-center gap-4">
              <img src={state.settings.masterPhoto || 'https://i.pravatar.cc/300?u=master'} className="w-20 h-20 rounded-full object-cover" alt="" />
              <div className="flex-1">
                <div className="font-black uppercase text-lg">{state.settings.masterName}</div>
                <button onClick={() => { setDraft({ name: state.settings.masterName, photo: state.settings.masterPhoto, rate: state.settings.masterRate }); setEditMaster(true); }}
                  className="mt-2 text-xs font-black uppercase text-wood bg-wood/10 px-3 py-1.5 rounded-lg active:scale-95">Edit</button>
              </div>
            </div>
          </div>

          {/* ── Daily rates ────────────────────── */}
          <div className="bg-white rounded-3xl shadow p-4">
            <div className="flex items-center gap-2 font-black uppercase text-sm mb-1">
              <Users size={16} className="text-wood" /> Daily rates
            </div>
            <div className="text-xs text-gray-400 font-bold mb-3">Tap anyone to change their name, photo, number or rate</div>
            <div className="space-y-2">
              {crewRows.map(r => (
                <button key={r.id} onClick={() => openRate(r as any)}
                  className="w-full flex items-center gap-3 border-2 border-gray-100 rounded-2xl p-2.5 active:scale-95 transition text-left">
                  <img src={r.photo || `https://i.pravatar.cc/150?u=${r.id}`} className="w-11 h-11 rounded-full object-cover" alt="" />
                  <div className="flex-1 min-w-0">
                    <div className="font-black uppercase truncate">{r.name}{r.id === 'master' ? ' (Master)' : ''}</div>
                    <div className="text-xs font-bold text-gray-400">₹{money(r.rate)}/day</div>
                  </div>
                  <Pencil size={16} className="text-wood shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* ── WhatsApp ───────────────────────── */}
          <div className="bg-white rounded-3xl shadow p-4">
            <div className="font-black uppercase text-sm mb-1 flex items-center gap-2"><MessageCircle size={16} className="text-green-600" /> Master WhatsApp number</div>
            <div className="text-xs font-bold text-gray-400 mb-3">
              Used when your team sends reports. Local or full international both work, e.g. <b>03001234567</b>
            </div>
            <Field label="Number">
              <div className="relative">
                <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className={inputCls + ' pl-10'} value={wa} onChange={e => setWa(e.target.value)} placeholder="03001234567" inputMode="tel" />
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={saveWa} className="py-3 rounded-2xl bg-green-600 text-white font-black uppercase active:scale-95">Save</button>
              <WhatsAppBtn phone={wa} message="Test — The Master's Eye is connected." label="Test" />
            </div>
          </div>

          {/* ── Accounts & login ───────────────── */}
          <div className="bg-white rounded-3xl shadow p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 font-black uppercase text-sm">
                <ShieldCheck size={16} className="text-wood" /> Logins & roles
              </div>
              <button onClick={() => setAddOpen(true)}
                className="flex items-center gap-1 text-xs font-black uppercase text-wood bg-wood/10 px-3 py-2 rounded-xl active:scale-95">
                <Plus size={14} /> Add
              </button>
            </div>
            <div className="text-xs text-gray-400 font-bold mb-3">
              Master, Vendor, Team and Client each log in with their own PIN and see their own menu — all on the
              same shared records, so an upload by a client shows up for the master. Logins keep working with no internet.
            </div>
            <div className="space-y-2">
              {!state.accounts.length && (
                <button onClick={setupMaster}
                  className="w-full py-3 rounded-2xl bg-wood/10 text-wood font-black uppercase text-xs active:scale-95">
                  Create the master login (PIN)
                </button>
              )}
              {state.accounts.map(acc => (
                <div key={acc.id} className="flex items-center gap-3 border-2 border-gray-100 rounded-2xl p-2.5">
                  <img src={acc.photo || `https://i.pravatar.cc/150?u=${acc.id}`} className="w-11 h-11 rounded-full object-cover" alt="" />
                  <div className="flex-1 min-w-0">
                    <div className="font-black uppercase truncate">{acc.name}</div>
                    <div className="text-[11px] font-bold text-gray-400 uppercase">
                      {roleLabel[acc.role]}
                      {acc.role === 'vendor' && ` · ${state.vendors.find(v => v.id === acc.vendorId)?.name || 'unlinked'}`}
                      {acc.role === 'team' && ` · ${state.workers.find(w => w.id === acc.workerId)?.name || 'unlinked'}`}
                      {acc.role === 'client' && ` · ${state.clients.find(c => c.id === acc.clientId)?.name || 'unlinked'}`}
                      {acc.id === account?.id ? ' · active' : ''}
                    </div>
                  </div>
                  <button onClick={() => changePin(acc)} title="Change PIN" className="p-2 bg-gray-100 rounded-lg active:scale-90"><KeyRound size={14} /></button>
                  <button onClick={() => removeAccount(acc)} title="Remove login" className="p-2 bg-red-50 rounded-lg active:scale-90"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Cloud server (master) — Drive-as-server, no Google sign-in ── */}
      {isMaster && (
        <div className="bg-white rounded-3xl shadow p-4">
          <div className="flex items-center gap-2 font-black uppercase text-sm mb-1">
            <Cloud size={16} className="text-blue-600" /> Cloud server
          </div>
          <div className="text-xs text-gray-400 font-bold mb-3">
            Your own Apps Script link plays the server: logins, signup, login log and backups live in your Google
            Drive. <b>No Google sign-in in the app</b> — the link is the connection. Leave empty to run local-only.
          </div>
          <Field label="Apps Script /exec link">
            <input className={inputCls + ' text-sm'} value={srvUrl} onChange={e => setSrvUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/…/exec" autoComplete="off" />
          </Field>
          <Field label="Support email (for “Forgot password?”)">
            <input className={inputCls + ' text-sm'} value={support} onChange={e => setSupport(e.target.value)}
              placeholder="you@example.com" inputMode="email" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={saveServer} className="py-3 rounded-2xl bg-blue-600 text-white font-black uppercase text-xs active:scale-95 flex items-center justify-center gap-2">
              <Server size={15} /> Save server
            </button>
            <button onClick={saveSupport} className="py-3 rounded-2xl bg-gray-100 font-black uppercase text-xs active:scale-95">Save contact</button>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <button onClick={doCloudPush} className="py-3 rounded-2xl bg-wood/10 text-wood font-black uppercase text-xs active:scale-95 flex items-center justify-center gap-2">
              <Cloud size={15} /> Backup now
            </button>
            <button onClick={doCloudPull} className="py-3 rounded-2xl bg-gray-100 font-black uppercase text-xs active:scale-95 flex items-center justify-center gap-2">
              <Upload size={15} /> Restore
            </button>
          </div>
          <button onClick={onConsole}
            className="mt-3 w-full py-3 rounded-2xl bg-gray-900 text-white font-black uppercase text-xs active:scale-95 flex items-center justify-center gap-2">
            <Smartphone size={15} /> Open Dev console
          </button>
          {srvMsg && <div className="text-xs font-black mt-2 text-center text-gray-600">{srvMsg}</div>}
          <div className="mt-3 bg-gray-50 rounded-xl p-3 text-[10px] font-bold text-gray-500 leading-relaxed">
            <b>One-time setup:</b> script.google.com → paste <b>tools/apps-script/Backend.gs</b> → Deploy as web app
            (Anyone) → copy the /exec link above. First run creates your “Master's Eye Server” spreadsheet in Drive.
            Auto-backup pushes 15 seconds after every change; reinstall → log in with your username → data returns.
            {upd && (
              <div className="mt-2 text-amber-700">
                <Download size={11} className="inline" /> <b>v{upd.latest} is available</b>
                {upd.notes ? ` — ${upd.notes}` : ''}
                {upd.url && <a href={upd.url} target="_blank" rel="noreferrer" className="underline"> Get it</a>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Data & backup ─────────────────────── */}
      <div className="bg-white rounded-3xl shadow p-4">
        <div className="flex items-center gap-2 font-black uppercase text-sm mb-3">
          <HardDrive size={16} className="text-wood" /> Data & backup
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <StatCard label="Records" value={state.ledger.length} sub="ledger entries" />
          <StatCard label="Attend. days" value={state.attendance.filter(a => a.masterPresent || a.presentIds.length > 0).length} sub="marked dates" />
        </div>
        <button onClick={sync} disabled={syncing}
          className="w-full py-4 rounded-2xl bg-gray-900 text-white font-black uppercase flex items-center justify-center gap-3 active:scale-95 shadow-lg">
          <RefreshCw size={22} className={syncing ? 'animate-spin' : ''} /> Backup to file
        </button>
        {state.lastSync && (
          <div className="text-center text-[11px] font-bold text-gray-400 uppercase mt-2">
            Last backup: {new Date(state.lastSync).toLocaleString()}
          </div>
        )}
        {isMaster && (
          <>
            <div className="h-3" />
            <button onClick={() => restoreRef.current?.click()}
              className="w-full py-4 rounded-2xl bg-blue-600 text-white font-black uppercase flex items-center justify-center gap-3 active:scale-95 shadow">
              <Upload size={20} /> Restore from file
            </button>
            <input ref={restoreRef} type="file" accept="application/json,.json" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; onRestoreFile(f); }} />
          </>
        )}
      </div>

      {isMaster && (
        /* ── Danger zone (master only) ──────────── */
        <div className="bg-white rounded-3xl shadow p-4 border-2 border-red-100">
          <div className="flex items-center gap-2 font-black uppercase text-sm mb-3 text-red-600">
            <Trash2 size={16} /> Danger zone
          </div>
          <button onClick={reset}
            className="w-full py-4 rounded-2xl bg-red-50 text-red-600 font-black uppercase flex items-center justify-center gap-3 active:scale-95 border-2 border-red-100">
            <Trash2 size={20} /> Reset all data
          </button>
          <div className="text-[10px] text-gray-400 font-bold text-center mt-2">Erases everything and starts with a blank app — no demo data.</div>
        </div>
      )}

      <div className="text-center pb-2">
        <div className="flex items-center justify-center gap-2 text-[11px] font-bold text-gray-400 uppercase">
          <Info size={14} /> The Master's Eye · v2
        </div>
        <div className="text-[11px] font-black text-gray-400 uppercase tracking-widest mt-1">
          Designed by Dr. Ishfaq Najar
        </div>
      </div>

      {/* ── Modals ────────────────────────────── */}
      <Modal open={editMaster} onClose={() => setEditMaster(false)} title="Edit master">
        <div className="flex justify-center my-3">
          <PhotoInput value={draft.photo} onChange={(v: string) => setDraft({ ...draft, photo: v })} />
        </div>
        <Field label="Name"><input className={inputCls} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></Field>
        <MoneyField label="Your daily rate" value={draft.rate} onChange={(v: number) => setDraft({ ...draft, rate: v })} />
        <button onClick={saveMaster} className="w-full py-4 rounded-2xl bg-wood text-white font-black uppercase active:scale-95 mt-2">Save</button>
      </Modal>

      <Modal open={!!rateEdit} onClose={() => setRateEdit(null)} title="Edit rate">
        <div className="flex justify-center my-3">
          <PhotoInput value={rateDraft.photo} onChange={(v: string) => setRateDraft({ ...rateDraft, photo: v })} />
        </div>
        <Field label="Name"><input className={inputCls} value={rateDraft.name} onChange={e => setRateDraft({ ...rateDraft, name: e.target.value })} /></Field>
        <MoneyField label="Daily rate" value={rateDraft.rate} onChange={(v: number) => setRateDraft({ ...rateDraft, rate: v })} />
        {rateEdit !== 'master' && (
          <Field label="WhatsApp number (optional)">
            <input className={inputCls} value={rateDraft.phone} onChange={e => setRateDraft({ ...rateDraft, phone: e.target.value })}
              placeholder="03001234567" inputMode="tel" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3 mt-2">
          <button onClick={() => setRateEdit(null)} className="py-4 rounded-2xl bg-gray-100 font-black uppercase active:scale-95">Cancel</button>
          <button onClick={saveRate} className="py-4 rounded-2xl bg-wood text-white font-black uppercase active:scale-95">Save</button>
        </div>
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="New login">
        <Field label="Name">
          <input className={inputCls} value={accDraft.name} onChange={e => setAccDraft({ ...accDraft, name: e.target.value })} placeholder="e.g. Ali Khan" />
        </Field>
        <div className="mb-3">
          <span className="text-xs font-black uppercase text-gray-400 block mb-1">Role</span>
          <div className="grid grid-cols-3 gap-2">
            {(['vendor', 'team', 'client'] as Role[]).map(r => (
              <button key={r} onClick={() => setAccDraft({ ...accDraft, role: r })}
                className={`py-3 rounded-2xl font-black uppercase text-xs active:scale-95 border-2 ${accDraft.role === r ? 'bg-wood text-white border-wood' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
                {r === 'vendor' ? 'Vendor' : r === 'team' ? 'Team' : 'Client'}
              </button>
            ))}
          </div>
        </div>
        {accDraft.role === 'vendor' && (
          <Field label="Linked vendor">
            <select className={inputCls} value={accDraft.vendorId} onChange={e => setAccDraft({ ...accDraft, vendorId: e.target.value })}>
              <option value="">— select —</option>
              {state.vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
        )}
        {accDraft.role === 'team' && (
          <Field label="Linked crew member">
            <select className={inputCls} value={accDraft.workerId} onChange={e => setAccDraft({ ...accDraft, workerId: e.target.value })}>
              <option value="">— select —</option>
              {state.workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
        )}
        {accDraft.role === 'client' && (
          <Field label="Linked client">
            <select className={inputCls} value={accDraft.clientId} onChange={e => setAccDraft({ ...accDraft, clientId: e.target.value })}>
              <option value="">— select —</option>
              {state.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="PIN (4–6 digits)">
          <input className={inputCls + ' text-center tracking-[0.4em]'} type="password" inputMode="numeric" maxLength={6}
            value={accDraft.pin} onChange={e => setAccDraft({ ...accDraft, pin: e.target.value.replace(/\D/g, '') })} placeholder="••••" />
        </Field>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <button onClick={() => setAddOpen(false)} className="py-4 rounded-2xl bg-gray-100 font-black uppercase active:scale-95">Cancel</button>
          <button onClick={addAccount} className="py-4 rounded-2xl bg-wood text-white font-black uppercase active:scale-95">Create</button>
        </div>
      </Modal>
    </div>
  );
}
