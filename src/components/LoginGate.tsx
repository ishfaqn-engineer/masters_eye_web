import React, { useState } from 'react';
import { Lock, KeyRound, ArrowRight, CloudDownload, UserPlus, LogIn, HelpCircle } from 'lucide-react';
import { AppState, Account, Role, blankState, normalizeState } from '../store';
import { makeAccount, verifyPin, hashPin } from '../lib/auth';
import {
  getServerUrl, setServerUrl, loginWithPassword, registerAccount, restoreState, normUser, validUser,
} from '../lib/server';
import { Field, inputCls } from './ui';

type Props = { state: AppState; setState: (s: AppState) => void; onLogin: (accountId: string) => void };

const roleLabel: Record<Role, string> = {
  master: 'Master', vendor: 'Vendor', team: 'Team member', client: 'Client', user: 'Member',
};

/* one-time server link entry — shows only when no link is stored yet */
const ServerField = ({ state, value, onChange }: { state: AppState; value: string; onChange: (v: string) => void }) => {
  if (getServerUrl(state) && !value) return null;
  return (
    <Field label="Server link (from the master — one time)">
      <input className={inputCls + ' text-sm'} value={value} onChange={e => onChange(e.target.value)}
        placeholder="https://script.google.com/macros/s/…/exec" autoComplete="off" />
    </Field>
  );
};

/* ── first run / welcome ──────────────────────────────────────────────
   Create the master PIN (works with zero internet), or switch to
   username login / sign-up. Reinstalling? Log in with your username —
   the server directory brings the logins back and the backup pulls the
   records. */
const SetupView = ({ state, setState, onLogin }: Props) => {
  const [view, setView] = useState<'setup' | 'login' | 'signup' | 'forgot'>('setup');

  // setup (create master)
  const [name, setName] = useState(state.settings.masterName || 'Master');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);

  // login / signup
  const [serverUrl, setServerUrlDraft] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [suName, setSuName] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const saveUrl = () => { if (serverUrl.trim()) setServerUrl(serverUrl.trim()); };

  const create = async () => {
    if (!/^\d{4,6}$/.test(pin)) { setErr('PIN must be 4 to 6 digits.'); return; }
    if (pin !== pin2) { setErr('The two PINs do not match.'); return; }
    setErr('');
    setBusy(true);
    try {
      const acc = await makeAccount({ name: name.trim() || 'Master', role: 'master', pin, photo: state.settings.masterPhoto });
      // append, never replace — a stale setup path must not wipe existing logins
      setState({ ...state, accounts: [...state.accounts, acc] });
      onLogin(acc.id);
    } finally { setBusy(false); }
  };

  /* finish a server login: fresh install → pull the backup first, then make
     sure the account exists locally so the session can resolve */
  const finishLogin = async (row: { id: string; username: string; name: string; role: string; pinHash: string; photo?: string; link?: string }) => {
    saveUrl();
    let next = state;
    const fresh = !state.accounts.length && !state.clients.length && !state.ledger.length;
    if (fresh) {
      let r = await restoreState(row.username);
      // member has no backup yet → the shared org copy holds the records
      if (r.ok === false && r.found === false) r = await restoreState('org');
      if (r.ok && r.data && (r.data as any).v === 2) {
        next = normalizeState(r.data, blankState());
        setMsg('Backup restored.');
      }
    }
    const acc: Account = {
      id: row.id, name: row.name, role: (row.role || 'user') as Role,
      pinHash: row.pinHash, username: row.username, photo: row.photo || '',
    };
    const accs = next.accounts.some(a => a.id === acc.id || (a.username && a.username === acc.username))
      ? next.accounts.map(a => (a.username === acc.username ? { ...a, ...acc } : a))
      : [...next.accounts, acc];
    setState({ ...next, accounts: accs });
    onLogin(acc.id);
  };

  const doLogin = async () => {
    setErr(''); setMsg('');
    if (!normUser(username)) { setErr('Type your username.'); return; }
    if (!password) { setErr('Type your password.'); return; }
    if (serverUrl.trim()) setServerUrl(serverUrl.trim());
    if (!getServerUrl()) { setErr('Paste the server link first (the master sends it).'); return; }
    setBusy(true);
    try {
      const res = await loginWithPassword({ username, password });
      if (!res.ok || !res.account) { setErr(res.error || 'Login failed.'); return; }
      await finishLogin({
        id: res.account.id, username: res.account.username || normUser(username),
        name: res.account.name, role: res.account.role, pinHash: res.account.pinHash,
        photo: res.account.photo,
      });
    } finally { setBusy(false); }
  };

  const doSignup = async () => {
    setErr(''); setMsg('');
    if (!validUser(username)) { setErr('Username: 3–24 letters, numbers, dot, dash or underscore.'); return; }
    if (!suName.trim()) { setErr('Type your name.'); return; }
    if (password.length < 4) { setErr('Password must be at least 4 characters.'); return; }
    if (password !== password2) { setErr('The two passwords do not match.'); return; }
    if (serverUrl.trim()) setServerUrl(serverUrl.trim());
    if (!getServerUrl()) { setErr('Paste the server link first (the master sends it).'); return; }
    setBusy(true);
    try {
      const res = await registerAccount({ username, name: suName, password, role: 'user' });
      if (!res.ok) { setErr(res.error || 'Sign-up failed.'); return; }
      const pinHash = await hashPin(password, normUser(username));
      const a = (res as any).account || {};
      await finishLogin({
        id: a.id || `user-${Date.now()}`, username: normUser(username),
        name: suName.trim(), role: 'user', pinHash,
      });
    } finally { setBusy(false); }
  };

  if (view === 'forgot') {
    return (
      <div className="min-h-screen bg-wood-dark flex flex-col items-center justify-center p-6 text-white">
        <EyeLogo />
        <h1 className="text-2xl font-black uppercase mt-5">Forgot password?</h1>
        <div className="text-xs font-bold uppercase opacity-60 mt-1 mb-8">We cannot show it — but the master can reset it</div>
        <div className="bg-white text-gray-900 rounded-3xl p-5 w-full max-w-sm shadow-2xl">
          <div className="text-sm font-bold text-gray-500 leading-relaxed">
            Passwords are stored as unreadable hashes, so nothing can be mailed back to you.
            Message the developer and the <b>master resets it from the Dev console</b> in seconds.
          </div>
          {state.settings.supportEmail && (
            <a href={`mailto:${state.settings.supportEmail}?subject=Master's Eye — reset my password`}
              className="mt-4 w-full py-4 rounded-2xl bg-wood text-white font-black uppercase active:scale-95 flex items-center justify-center gap-2">
              <HelpCircle size={20} /> Email {state.settings.supportEmail}
            </a>
          )}
          {!state.settings.supportEmail && (
            <div className="mt-4 text-xs font-black uppercase text-gray-400 text-center">
              No contact saved yet — ask the master to set a support email in Settings.
            </div>
          )}
          <button onClick={() => { setView('login'); setErr(''); setMsg(''); }}
            className="w-full py-3 mt-3 rounded-2xl bg-gray-100 font-black uppercase text-xs active:scale-95">
            Back to log in
          </button>
        </div>
        <Credit />
      </div>
    );
  }

  if (view === 'login' || view === 'signup') {
    const isLogin = view === 'login';
    return (
      <div className="min-h-screen bg-wood-dark flex flex-col items-center justify-center p-6 text-white">
        <EyeLogo />
        <h1 className="text-2xl font-black uppercase mt-5">The Master's Eye</h1>
        <div className="text-xs font-bold uppercase opacity-60 mt-1 mb-8">{isLogin ? 'Log in to your account' : 'Create your account'}</div>

        <div className="bg-white text-gray-900 rounded-3xl p-5 w-full max-w-sm shadow-2xl">
          <ServerField state={state} value={serverUrl} onChange={setServerUrlDraft} />
          <Field label="Username">
            <input className={inputCls} value={username} onChange={e => setUsername(e.target.value)}
              autoCapitalize="none" autoComplete="username" placeholder="e.g. rahul.wood" />
          </Field>
          {!isLogin && (
            <Field label="Your name">
              <input className={inputCls} value={suName} onChange={e => setSuName(e.target.value)} placeholder="e.g. Rahul Ahmad" />
            </Field>
          )}
          <Field label="Password">
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className={inputCls + ' pl-10'} type="password" value={password}
                onChange={e => setPassword(e.target.value)} autoComplete={isLogin ? 'current-password' : 'new-password'} />
            </div>
          </Field>
          {!isLogin && (
            <Field label="Repeat password">
              <input className={inputCls} type="password" value={password2}
                onChange={e => setPassword2(e.target.value)} autoComplete="new-password" />
            </Field>
          )}
          {err && <div className="text-red-600 text-xs font-black uppercase text-center mb-2">{err}</div>}
          {msg && <div className="text-green-700 text-xs font-black uppercase text-center mb-2">{msg}</div>}
          <button onClick={isLogin ? doLogin : doSignup} disabled={busy}
            className="w-full py-4 rounded-2xl bg-wood text-white font-black uppercase active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60">
            {isLogin ? <LogIn size={20} /> : <UserPlus size={20} />}
            {busy ? 'Please wait…' : isLogin ? 'Log in' : 'Sign up'}
          </button>
          <div className="flex items-center justify-between mt-3 text-[11px] font-black uppercase">
            {isLogin ? (
              <>
                <button onClick={() => { setErr(''); setView('forgot'); }} className="text-wood">Forgot password?</button>
                <button onClick={() => { setErr(''); setView('signup'); }} className="text-gray-400">Sign up</button>
              </>
            ) : (
              <>
                <button onClick={() => { setErr(''); setView('login'); }} className="text-gray-400">I have an account</button>
                <button onClick={() => { setErr(''); setView('setup'); }} className="text-wood">Create master</button>
              </>
            )}
          </div>
        </div>
        <Credit />
      </div>
    );
  }

  /* view === 'setup' */
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
        {err && <div className="text-red-600 text-xs font-black uppercase text-center mb-2">{err}</div>}
        <button onClick={create} disabled={busy}
          className="w-full py-4 rounded-2xl bg-wood text-white font-black uppercase active:scale-95 mt-1 flex items-center justify-center gap-2">
          <KeyRound size={20} /> {busy ? 'Setting up…' : 'Create login'}
        </button>
      </div>

      {/* reinstall / member path — deleting the app kills local storage, but
          the server keeps the directory + the backup: log in once, everything
          comes back */}
      <div className="bg-white/10 border border-white/20 rounded-3xl p-4 w-full max-w-sm mt-4">
        <div className="flex items-center gap-2 font-black uppercase text-xs mb-1">
          <CloudDownload size={15} /> Already have an account?
        </div>
        <div className="text-[11px] font-bold opacity-70 mb-2">
          Reinstalled, ya naya phone — apne username se kholein, saara data wapas aa jayega.
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => { setErr(''); setView('login'); }}
            className="py-3 rounded-2xl bg-white text-gray-900 font-black uppercase text-xs active:scale-95 flex items-center justify-center gap-2">
            <LogIn size={15} /> Log in
          </button>
          <button onClick={() => { setErr(''); setView('signup'); }}
            className="py-3 rounded-2xl bg-white/15 border border-white/25 font-black uppercase text-xs active:scale-95 flex items-center justify-center gap-2">
            <UserPlus size={15} /> Sign up
          </button>
        </div>
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

/* Login: pick account → enter PIN. Server accounts can also be reached by
   username from here (members who never got a local profile tile). */
export default function LoginGate({ state, setState, onLogin }: Props) {
  const [picked, setPicked] = useState<Account | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [serverView, setServerView] = useState<null | 'login' | 'signup' | 'forgot'>(null);
  const [forceSetup, setForceSetup] = useState(false);

  // first run only: no logins exist yet, so force the setup screen
  if (!state.accounts.length || forceSetup) {
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

  if (serverView) {
    // members sign in with username + password even when local tiles exist
    return (
      <ServerSubView which={serverView} state={state} setState={setState} onLogin={onLogin}
        onBack={() => setServerView(null)} />
    );
  }

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
                <div className="text-[11px] font-bold uppercase opacity-60">{roleLabel[acc.role] || acc.role}</div>
              </div>
              <ArrowRight size={22} className="opacity-60 shrink-0" />
            </button>
          ))}
          <div className="flex items-center justify-between pt-1 text-[11px] font-black uppercase">
            <button onClick={() => setServerView('login')} className="text-white/70 flex items-center gap-1">
              <LogIn size={13} /> Log in with username
            </button>
            <button onClick={() => setServerView('signup')} className="text-white/70 flex items-center gap-1">
              <UserPlus size={13} /> Sign up
            </button>
          </div>
          {!state.accounts.some(a => a.role === 'master') && (
            <button onClick={() => setForceSetup(true)}
              className="w-full py-3 rounded-2xl bg-white/10 border border-white/20 font-black uppercase text-[11px] active:scale-95">
              Set up the master login
            </button>
          )}
        </div>
      )}

      {picked && (
        <div className="bg-white text-gray-900 rounded-3xl p-5 w-full max-w-sm shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <img src={picked.photo || `https://i.pravatar.cc/150?u=${picked.id}`} className="w-12 h-12 rounded-full object-cover" alt="" />
            <div>
              <div className="font-black uppercase">{picked.name}</div>
              <div className="text-[11px] font-bold text-gray-400 uppercase">{roleLabel[picked.role] || picked.role}</div>
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

/* username login / sign-up / forgot, reachable when local tiles exist too.
   Lives in its own component so SetupView and the picker share one code path. */
const ServerSubView = ({ which, state, setState, onLogin, onBack }: Props & { which: 'login' | 'signup' | 'forgot'; onBack: () => void }) => {
  const [view, setView] = useState(which);
  const [serverUrl, setServerUrlDraft] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [suName, setSuName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const finishLogin = async (row: { id: string; username: string; name: string; role: string; pinHash: string }) => {
    if (serverUrl.trim()) setServerUrl(serverUrl.trim());
    const acc: Account = {
      id: row.id, name: row.name, role: (row.role || 'user') as Role,
      pinHash: row.pinHash, username: row.username,
    };
    const accs = state.accounts.some(a => a.id === acc.id || (a.username && a.username === acc.username))
      ? state.accounts.map(a => (a.username === acc.username ? { ...a, ...acc } : a))
      : [...state.accounts, acc];
    setState({ ...state, accounts: accs });
    onLogin(acc.id);
  };

  const doLogin = async () => {
    setErr('');
    if (!normUser(username)) { setErr('Type your username.'); return; }
    if (!password) { setErr('Type your password.'); return; }
    if (serverUrl.trim()) setServerUrl(serverUrl.trim());
    if (!getServerUrl()) { setErr('Paste the server link first (the master sends it).'); return; }
    setBusy(true);
    try {
      const res = await loginWithPassword({ username, password });
      if (!res.ok || !res.account) { setErr(res.error || 'Login failed.'); return; }
      const a = res.account;
      await finishLogin({ id: a.id, username: a.username || normUser(username), name: a.name, role: a.role, pinHash: a.pinHash });
    } finally { setBusy(false); }
  };

  const doSignup = async () => {
    setErr('');
    if (!validUser(username)) { setErr('Username: 3–24 letters, numbers, dot, dash or underscore.'); return; }
    if (!suName.trim()) { setErr('Type your name.'); return; }
    if (password.length < 4) { setErr('Password must be at least 4 characters.'); return; }
    if (password !== password2) { setErr('The two passwords do not match.'); return; }
    if (serverUrl.trim()) setServerUrl(serverUrl.trim());
    if (!getServerUrl()) { setErr('Paste the server link first (the master sends it).'); return; }
    setBusy(true);
    try {
      const res = await registerAccount({ username, name: suName, password, role: 'user' });
      if (!res.ok) { setErr(res.error || 'Sign-up failed.'); return; }
      const pinHash = await hashPin(password, normUser(username));
      const a = (res as any).account || {};
      await finishLogin({ id: a.id || `user-${Date.now()}`, username: normUser(username), name: suName.trim(), role: 'user', pinHash });
    } finally { setBusy(false); }
  };

  if (view === 'forgot') {
    return (
      <div className="min-h-screen bg-wood-dark flex flex-col items-center justify-center p-6 text-white">
        <EyeLogo />
        <h1 className="text-2xl font-black uppercase mt-5">Forgot password?</h1>
        <div className="bg-white text-gray-900 rounded-3xl p-5 w-full max-w-sm shadow-2xl mt-6">
          <div className="text-sm font-bold text-gray-500 leading-relaxed">
            Passwords are stored as unreadable hashes — nothing can be mailed back.
            The <b>master resets it from the Dev console</b> in seconds.
          </div>
          {state.settings.supportEmail && (
            <a href={`mailto:${state.settings.supportEmail}?subject=Master's Eye — reset my password`}
              className="mt-4 w-full py-4 rounded-2xl bg-wood text-white font-black uppercase active:scale-95 flex items-center justify-center gap-2">
              <HelpCircle size={20} /> Email {state.settings.supportEmail}
            </a>
          )}
          <button onClick={onBack}
            className="w-full py-3 mt-3 rounded-2xl bg-gray-100 font-black uppercase text-xs active:scale-95">
            Back
          </button>
        </div>
        <Credit />
      </div>
    );
  }

  const isLogin = view === 'login';
  return (
    <div className="min-h-screen bg-wood-dark flex flex-col items-center justify-center p-6 text-white">
      <EyeLogo />
      <h1 className="text-2xl font-black uppercase mt-5">The Master's Eye</h1>
      <div className="text-xs font-bold uppercase opacity-60 mt-1 mb-8">{isLogin ? 'Log in to your account' : 'Create your account'}</div>
      <div className="bg-white text-gray-900 rounded-3xl p-5 w-full max-w-sm shadow-2xl">
        <ServerField state={state} value={serverUrl} onChange={setServerUrlDraft} />
        <Field label="Username">
          <input className={inputCls} value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="none" autoComplete="username" />
        </Field>
        {!isLogin && (
          <Field label="Your name">
            <input className={inputCls} value={suName} onChange={e => setSuName(e.target.value)} />
          </Field>
        )}
        <Field label="Password">
          <div className="relative">
            <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className={inputCls + ' pl-10'} type="password" value={password}
              onChange={e => setPassword(e.target.value)} autoComplete={isLogin ? 'current-password' : 'new-password'} />
          </div>
        </Field>
        {!isLogin && (
          <Field label="Repeat password">
            <input className={inputCls} type="password" value={password2} onChange={e => setPassword2(e.target.value)} autoComplete="new-password" />
          </Field>
        )}
        {err && <div className="text-red-600 text-xs font-black uppercase text-center mb-2">{err}</div>}
        <button onClick={isLogin ? doLogin : doSignup} disabled={busy}
          className="w-full py-4 rounded-2xl bg-wood text-white font-black uppercase active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60">
          {isLogin ? <LogIn size={20} /> : <UserPlus size={20} />}
          {busy ? 'Please wait…' : isLogin ? 'Log in' : 'Sign up'}
        </button>
        <div className="flex items-center justify-between mt-3 text-[11px] font-black uppercase">
          {isLogin ? (
            <>
              <button onClick={() => { setErr(''); setView('forgot'); }} className="text-wood">Forgot password?</button>
              <button onClick={() => { setErr(''); setView('signup'); }} className="text-gray-400">Sign up</button>
            </>
          ) : (
            <button onClick={() => { setErr(''); setView('login'); }} className="text-gray-400">I have an account</button>
          )}
          <button onClick={onBack} className="text-gray-400">Back</button>
        </div>
      </div>
      <Credit />
    </div>
  );
};
