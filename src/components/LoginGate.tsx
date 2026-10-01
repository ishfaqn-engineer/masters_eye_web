import React, { useState } from 'react';
import { Lock, KeyRound, ArrowRight, CloudDownload } from 'lucide-react';
import { AppState, Account, Role, blankState, normalizeState } from '../store';
import { makeAccount, verifyPin } from '../lib/auth';
import { drivePull, driveFileName } from '../lib/drive';
import { Field, inputCls } from './ui';

type Props = { state: AppState; setState: (s: AppState) => void; onLogin: (accountId: string) => void };

const roleLabel: Record<Role, string> = { master: 'Master', vendor: 'Vendor', team: 'Team member', client: 'Client' };

/* First-run setup: create the master's PIN. Shown only when accounts is empty.
   Also the REINSTALL path: a wiped phone has no logins left, so this screen
   offers "restore from Google Drive" — sign in once, the old accounts and every
   record come back, then log in with your usual PIN. */
const SetupView = ({ state, setState, onLogin }: Props) => {
  const [name, setName] = useState(state.settings.masterName || 'Master');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);

  // reinstall restore — google client id survives only if baked or retyped here
  const [cid, setCid] = useState(state.settings.googleClientId);
  const [restoring, setRestoring] = useState(false);
  const [msg, setMsg] = useState('');

  const rememberCid = (clientId: string) =>
    setState({ ...state, settings: { ...state.settings, googleClientId: clientId } });

  const restore = async () => {
    const clientId = cid.trim();
    if (!clientId) { setMsg('Google Client ID chahiye — upar type karein (one-time).'); return; }
    setRestoring(true);
    setMsg('Google mein sign-in ho raha hai…');
    try {
      const res = await drivePull<any>(clientId, driveFileName());
      if (!res.ok && res.found === false) {
        rememberCid(clientId);
        setMsg('Drive par backup nahi mila — wahi Google account chunein jisne push kiya tha.');
      } else if (!res.ok) {
        rememberCid(clientId);
        setMsg('✗ ' + (res.error || 'Drive se download nahi hua.'));
      } else if (res.data?.v !== 2) {
        setMsg("Ye Drive copy Master's Eye v2 backup nahi hai.");
      } else {
        const next = normalizeState(res.data, blankState());
        // keep the id typed on this screen even if the backup predates it
        setState({
          ...next,
          settings: { ...next.settings, googleClientId: next.settings.googleClientId || clientId },
        });
        // accounts are back → LoginGate switches straight to the account picker
      }
    } finally {
      setRestoring(false);
    }
  };

  const create = async () => {
    if (!/^\d{4,6}$/.test(pin)) { alert('PIN must be 4 to 6 digits.'); return; }
    if (pin !== pin2) { alert('The two PINs do not match.'); return; }
    setBusy(true);
    try {
      const acc = await makeAccount({ name: name.trim() || 'Master', role: 'master', pin, photo: state.settings.masterPhoto });
      // append, never replace — a stale setup path must not wipe existing logins
      setState({ ...state, accounts: [...state.accounts, acc] });
      onLogin(acc.id);
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-wood-dark flex flex-col items-center justify-center p-6 text-white">
      <EyeLogo />
      <h1 className="text-2xl font-black uppercase mt-5">The Master's Eye</h1>
      <div className="text-xs font-bold uppercase opacity-60 mt-1 mb-8">Set up your login</div>

      <div className="bg-white text-gray-900 rounded-3xl p-5 w-full max-w-sm shadow-2xl">
        <Field label="Your name">
          <input className={inputCls} value={name} onChange={e => setName(e.target.value)} />
        </Field>
        <Field label="Choose a 4–6 digit PIN">
          <input className={inputCls + ' text-center tracking-[0.5em]'} type="password" inputMode="numeric"
            maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
        </Field>
        <Field label="Repeat PIN">
          <input className={inputCls + ' text-center tracking-[0.5em]'} type="password" inputMode="numeric"
            maxLength={6} value={pin2} onChange={e => setPin2(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
        </Field>
        <button onClick={create} disabled={busy}
          className="w-full py-4 rounded-2xl bg-wood text-white font-black uppercase active:scale-95 mt-1 flex items-center justify-center gap-2">
          <KeyRound size={20} /> {busy ? 'Setting up…' : 'Create login'}
        </button>
      </div>

      {/* reinstall path — no local data survives deleting the app, but the
          Drive copy holds every record AND every login, so one Google
          sign-in brings the whole organisation back */}
      <div className="bg-white/10 border border-white/20 rounded-3xl p-4 w-full max-w-sm mt-4">
        <div className="flex items-center gap-2 font-black uppercase text-xs mb-1">
          <CloudDownload size={15} /> Reinstalled the app?
        </div>
        <div className="text-[11px] font-bold opacity-70 mb-2">
          Google account se sign-in karein — saare records aur logins wapas aa jayenge, phir apne PIN se kholein.
        </div>
        <input
          value={cid}
          onChange={e => setCid(e.target.value)}
          placeholder="Google Client ID (one-time)"
          className="w-full border-2 border-white/20 bg-white/5 rounded-xl p-2.5 text-[11px] font-bold text-white placeholder-white/40 outline-none focus:border-white/50 mb-2"
          autoComplete="off"
        />
        <button onClick={restore} disabled={restoring}
          className="w-full py-3 rounded-2xl bg-blue-600 text-white font-black uppercase text-xs active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60">
          <CloudDownload size={16} /> {restoring ? 'Restoring…' : 'Restore from Google Drive'}
        </button>
        {msg && <div className="text-[11px] font-bold text-amber-300 mt-2">{msg}</div>}
      </div>

      <div className="text-[11px] font-bold opacity-50 mt-6 text-center max-w-xs">
        You can add Vendor, Team and Client logins later from Settings.
      </div>
      <Credit />
    </div>
  );
};

const Credit = () => (
  <div className="text-[11px] font-black uppercase tracking-widest opacity-50 mt-8 text-center">
    Designed by Dr. Ishfaq Najar
  </div>
);

const EyeLogo = () => (
  <div className="w-20 h-20 rounded-3xl bg-white/10 border-2 border-white/20 flex items-center justify-center">
    <svg width="56" height="34" viewBox="0 0 64 40" fill="none">
      <ellipse cx="32" cy="20" rx="28" ry="17" stroke="white" strokeWidth="4" />
      <circle cx="32" cy="20" r="9" fill="white" />
      <circle cx="32" cy="20" r="4" fill="#6b4423" />
    </svg>
  </div>
);

/* Login: pick account → enter PIN */
export default function LoginGate({ state, setState, onLogin }: Props) {
  const [picked, setPicked] = useState<Account | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  // first run only: no logins exist yet, so force the setup screen
  if (!state.accounts.length) {
    return <SetupView state={state} setState={setState} onLogin={onLogin} />;
  }

  const enter = async (acc: Account, thePin: string) => {
    const ok = await verifyPin(acc, thePin);
    if (!ok) { setError('Wrong PIN — try again.'); setPin(''); return; }
    setError('');
    onLogin(acc.id);
  };

  const onPick = (acc: Account) => { setPicked(acc); setPin(''); setError(''); };

  const onSubmit = () => {
    if (!picked) return;
    enter(picked, pin);
  };

  return (
    <div className="min-h-screen bg-wood-dark flex flex-col items-center justify-center p-6 text-white">
      <EyeLogo />
      <h1 className="text-2xl font-black uppercase mt-5">The Master's Eye</h1>
      <div className="text-xs font-bold uppercase opacity-60 mt-1 mb-8">Who is using the app?</div>

      {!picked && (
        <div className="w-full max-w-sm space-y-3">
          {state.accounts.map(acc => (
            <button key={acc.id} onClick={() => onPick(acc)}
              className="w-full flex items-center gap-4 bg-white/10 hover:bg-white/15 border border-white/15 rounded-3xl p-4 active:scale-95 transition text-left">
              <img src={acc.photo || `https://i.pravatar.cc/150?u=${acc.id}`}
                className="w-14 h-14 rounded-full object-cover bg-white/20" alt="" />
              <div className="flex-1 min-w-0">
                <div className="font-black uppercase truncate">{acc.name}</div>
                <div className="text-[11px] font-bold uppercase opacity-60">{roleLabel[acc.role]}</div>
              </div>
              <ArrowRight size={22} className="opacity-60 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {picked && (
        <div className="bg-white text-gray-900 rounded-3xl p-5 w-full max-w-sm shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <img src={picked.photo || `https://i.pravatar.cc/150?u=${picked.id}`} className="w-12 h-12 rounded-full object-cover" alt="" />
            <div>
              <div className="font-black uppercase">{picked.name}</div>
              <div className="text-[11px] font-bold text-gray-400 uppercase">{roleLabel[picked.role]}</div>
            </div>
            <button onClick={() => { setPicked(null); setPin(''); setError(''); }}
              className="ml-auto text-xs font-black uppercase text-gray-400 px-2 py-1">Change</button>
          </div>
          <Field label="Enter PIN">
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                className={inputCls + ' pl-10 text-center tracking-[0.5em]'}
                type="password" inputMode="numeric" maxLength={6}
                value={pin}
                onChange={e => { const v = e.target.value.replace(/\D/g, ''); setPin(v); setError(''); if (v.length === 6) enter(picked, v); }}
                onKeyDown={e => { if (e.key === 'Enter') onSubmit(); }}
                placeholder="••••"
              />
            </div>
          </Field>
          {error && <div className="text-red-600 text-xs font-black uppercase text-center mb-2">{error}</div>}
          <button onClick={onSubmit} disabled={pin.length < 4}
            className={`w-full py-4 rounded-2xl font-black uppercase active:scale-95 flex items-center justify-center gap-2 ${pin.length >= 4 ? 'bg-wood text-white' : 'bg-gray-100 text-gray-300'}`}>
            <KeyRound size={20} /> Enter
          </button>
        </div>
      )}
      <Credit />
    </div>
  );
}
