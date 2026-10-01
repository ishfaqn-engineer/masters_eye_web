import React, { useEffect, useState } from 'react';
import { Camera, Users, Wallet, Settings as Cog, Home, LogOut } from 'lucide-react';
import { AppState, loadState, saveState, syncToDrive, Account, effectiveCid } from './store';
import { readSession, writeSession, clearSession } from './lib/auth';
import { drivePush, driveFileName, isConnected, silentConnect, everConnected } from './lib/drive';
import { Header } from './components/ui';
import LoginGate from './components/LoginGate';
import Dashboard from './pages/Dashboard';
import VendorHome from './pages/VendorHome';
import MyWork from './pages/MyWork';
import ClientHome from './pages/ClientHome';
import TeamPage from './pages/TeamPage';
import ClientsPage from './pages/ClientsPage';
import OrdersPage from './pages/OrdersPage';
import MillPage from './pages/MillPage';
import PaymentsPage from './pages/PaymentsPage';
import ExpensesPage from './pages/ExpensesPage';
import SettingsPage from './pages/SettingsPage';
import Assistant from './components/Assistant';

const titles: Record<string, string> = {
  dashboard: "Master's Eye",
  vendorHome: 'My Supply',
  mywork: 'My Work',
  clientHome: 'My Orders',
  team: 'Team & Attendance',
  clients: 'Clients',
  orders: 'Orders & Designs',
  mill: 'Joinery Mill',
  payments: 'Payments',
  expenses: 'Consumables',
  settings: 'Settings'
};

type Role = 'master' | 'vendor' | 'team' | 'client';

export default function App() {
  const [state, setStateRaw] = useState<AppState>(() => loadState());
  const [page, setPage] = useState('dashboard');
  const [syncing, setSyncing] = useState(false);
  const [session, setSession] = useState<string | null>(() => readSession());

  useEffect(() => { saveState(state); }, [state]);

  /* ── cloud auto-backup (the "other apps" behaviour) ─────────────────────
     Once Google has been connected on this install, every boot silently
     resumes the session and re-pushes the latest state; every change after
     that re-pushes on a short debounce. Deinstalling the phone app doesn't
     touch this copy — reinstalling pulls it straight back. */
  useEffect(() => {
    const cid = effectiveCid(state);
    if (!cid) return;
    // only worth attempting when a grant could exist: previously connected,
    // or an owner-saved Client ID from the old (pre-flag) builds
    if (!everConnected() && !state.settings.googleClientId) return;
    let dead = false;
    silentConnect(cid).then(ok => {
      if (dead || !ok) return;
      drivePush(cid, driveFileName(), state).catch(() => { /* offline */ });
    });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isConnected()) return;
    const cid = effectiveCid(state);
    if (!cid) return;
    const t = setTimeout(() => { drivePush(cid, driveFileName(), state).catch(() => { /* offline */ }); }, 8000);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'hidden' || !isConnected()) return;
      const cid = effectiveCid(state);
      if (cid) drivePush(cid, driveFileName(), state).catch(() => { /* offline */ });
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [state]);

  const setState = (s: AppState) => setStateRaw(s);

  const account: Account | null = state.accounts.find(a => a.id === session) || null;
  const gated = state.accounts.length > 0;
  const role: Role = account ? account.role : 'master';

  const login = (id: string) => { writeSession(id); setSession(id); setPage('dashboard'); };
  const logout = () => { clearSession(); setSession(null); setPage('dashboard'); };

  const sync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await syncToDrive(state);
      // functional update so a save landing while the picker is open isn't clobbered
      if (res.ok) setStateRaw(prev => ({ ...prev, lastSync: res.at }));
    } finally {
      setSyncing(false);
    }
  };

  /* role allow-lists */
  const allowed: Record<Role, string[]> = {
    master: ['dashboard', 'team', 'clients', 'orders', 'mill', 'payments', 'expenses', 'settings'],
    vendor: ['vendorHome', 'settings'],
    team: ['mywork', 'settings'],
    client: ['clientHome', 'settings'],
  };
  const home: Record<Role, string> = { master: 'dashboard', vendor: 'vendorHome', team: 'mywork', client: 'clientHome' };
  const current = allowed[role].includes(page) ? page : home[role];
  const go = (p: string) => setPage(allowed[role].includes(p) ? p : home[role]);

  if (!account) {
    // no session (or no logins exist yet) — LoginGate handles first-run setup too
    return <LoginGate state={state} setState={setState} onLogin={login} />;
  }

  const body = () => {
    switch (current) {
      case 'vendorHome': return <VendorHome state={state} account={account!} />;
      case 'mywork': return <MyWork state={state} account={account!} />;
      case 'clientHome': return <ClientHome state={state} setState={setState} account={account!} />;
      case 'team': return <TeamPage state={state} setState={setState} />;
      case 'clients': return <ClientsPage state={state} setState={setState} />;
      case 'orders': return <OrdersPage state={state} setState={setState} />;
      case 'mill': return <MillPage state={state} setState={setState} />;
      case 'payments': return <PaymentsPage state={state} setState={setState} />;
      case 'expenses': return <ExpensesPage state={state} setState={setState} />;
      case 'settings': return <SettingsPage state={state} setState={setState} sync={sync} syncing={syncing} account={account} role={role} onLogout={logout} />;
      default: return <Dashboard state={state} navigate={go} sync={sync} syncing={syncing} />;
    }
  };

  const nav = role === 'master' ? [
    { id: 'dashboard', icon: Home, label: 'Home' },
    { id: 'clients', icon: Camera, label: 'Clients' },
    { id: 'team', icon: Users, label: 'Team' },
    { id: 'payments', icon: Wallet, label: 'Money' },
    { id: 'settings', icon: Cog, label: 'More' },
  ] : role === 'vendor' ? [
    { id: 'vendorHome', icon: Home, label: 'Home' },
    { id: 'settings', icon: Cog, label: 'More' },
  ] : role === 'client' ? [
    { id: 'clientHome', icon: Home, label: 'Home' },
    { id: 'settings', icon: Cog, label: 'More' },
  ] : [
    { id: 'mywork', icon: Home, label: 'Home' },
    { id: 'settings', icon: Cog, label: 'More' },
  ];

  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50 pb-24 select-none relative">
      <Header
        title={titles[current] || "Master's Eye"}
        showBack={current !== home[role]}
        onBack={() => go(home[role])}
        right={
          <div className="flex items-center gap-2">
            {account && (
              <div className="text-right leading-tight mr-1">
                <div className="text-[10px] font-black uppercase opacity-80 truncate max-w-[90px]">{account.name}</div>
                <div className="text-[9px] font-bold uppercase opacity-50">{account.role}</div>
              </div>
            )}
            {gated && (
              <button onClick={logout} title="Log out" className="p-2 bg-white/15 rounded-full active:scale-90">
                <LogOut size={20} />
              </button>
            )}
          </div>
        }
      />
      {body()}
      {role === 'master' && <Assistant state={state} setState={setState} />}
      <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white border-t border-gray-200 px-6 py-3 flex justify-between items-center shadow-2xl z-40">
        {nav.map(n => (
          <button key={n.id} onClick={() => go(n.id)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-2xl transition active:scale-90
              ${current === n.id ? 'text-white bg-wood shadow' : 'text-gray-400'}`}>
            <n.icon size={22} />
            <span className="text-[9px] font-black uppercase">{n.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
