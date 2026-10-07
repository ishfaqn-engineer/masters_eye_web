import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Trash2, RefreshCw, Phone, Pencil, Upload, Users, HardDrive, Info, Cloud, Server, Smartphone, Download } from 'lucide-react';
import { AppState, Account, Role, blankState, normalizeState, Worker, APP_CODE } from '../store';
import { money, Modal, Field, inputCls, PhotoInput, MoneyField, StatCard, WhatsAppBtn } from '../components/ui';
import { clearFiles } from '../lib/files';
import {
  getServerUrl, setServerUrl, ping, backupState, restoreState, syncDirectory, checkUpdate, UpdateInfo,
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

export default function SettingsPage({ state, setState, sync, syncing, account, role, onLogout, onConsole }: Props) {
  const isMaster = role === 'master';
  const [editMaster, setEditMaster] = useState(false);
  const [draft, setDraft] = useState({ name: state.settings.masterName, photo: state.settings.masterPhoto, rate: state.settings.masterRate });
  const [wa, setWa] = useState(state.settings.whatsappNumber);
  const [rateEdit, setRateEdit] = useState<Worker | 'master' | null>(null);
  const [rateDraft, setRateDraft] = useState({ name: '', photo: '', rate: 0, phone: '' });
  const restoreRef = useRef<HTMLInputElement>(null);


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
  const cloudUser = () => 'owner';

  const doCloudPush = async () => {
    const who = cloudUser();
    setSrvMsg('Pushing to your Drive…');
    const res = await backupState(who, state);
    setSrvMsg(res.ok ? `✓ Backed up at ${new Date().toLocaleTimeString()}` : `✗ ${res.error}`);
  };

  const doCloudPull = async () => {
    const who = cloudUser();
    if (!confirm('Replace ALL current data with the copy from the server?')) return;
    setSrvMsg('Downloading from your Drive…');
    const res = await restoreState(who);
    if (!res.ok) { setSrvMsg(`✗ ${res.error}`); return; }
    if (res.data?.v !== 2) { setSrvMsg('✗ That copy is not a Master\'s Eye v2 backup.'); return; }
    const next = normalizeState(res.data, blankState());
    setState(next);
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
    setState(blankState());
    clearFiles().catch(() => { /* best effort */ });
  };

  const crewRows = [
    { id: 'master' as const, name: state.settings.masterName, photo: state.settings.masterPhoto, rate: state.settings.masterRate },
    ...state.workers
  ];

  return (
    <div className="p-4 space-y-4">
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

        </>
      )}

      {/* ── Cloud server (master) — Drive-as-server, no Google sign-in ── */}
      {isMaster && (
        <div className="bg-white rounded-3xl shadow p-4">
          <div className="flex items-center gap-2 font-black uppercase text-sm mb-1">
            <Cloud size={16} className="text-blue-600" /> Cloud server
          </div>
          <div className="text-xs text-gray-400 font-bold mb-3">
            Your own Apps Script link is used only for backup and restore in your Google Drive.
            <b>No app login, PIN, mobile ID or Google sign-in is required.</b> Leave it empty to run local-only.
          </div>
          <Field label="Apps Script /exec link">
            <input className={inputCls + ' text-sm'} value={srvUrl} onChange={e => setSrvUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/…/exec" autoComplete="off" />
          </Field>
          <button onClick={saveServer} className="w-full py-3 rounded-2xl bg-blue-600 text-white font-black uppercase text-xs active:scale-95 flex items-center justify-center gap-2">
            <Server size={15} /> Save backup link
          </button>
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
            Auto-backup pushes shortly after changes. After reinstalling, paste the same /exec link and use Restore to bring the data back.
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

    </div>
  );
}
