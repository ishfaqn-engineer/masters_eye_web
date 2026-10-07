import React, { useEffect, useState } from 'react';
import { Camera, Users, Wallet, Settings as Cog, Home } from 'lucide-react';
import { AppState, loadState, saveState, syncToDrive, Account, APP_VERSION } from './store';
import { hasServer, heartbeat, installPing, backupState } from './lib/server';
import { Header } from './components/ui';
import Dashboard from './pages/Dashboard';
import VendorHome from './pages/VendorHome';
import MyWork from './pages/MyWork';
import ClientHome from './pages/ClientHome';
import UserHome from './pages/UserHome';
import TeamPage from './pages/TeamPage';
import ClientsPage from './pages/ClientsPage';
import OrdersPage from './pages/OrdersPage';
import MillPage from './pages/MillPage';
import PaymentsPage from './pages/PaymentsPage';
import ExpensesPage from './pages/ExpensesPage';
import SettingsPage from './pages/SettingsPage';
import Console from './pages/Console';

const titles: Record<string, string> = {
  dashboard: "Master's Eye",
  vendorHome: 'My Supply',
  mywork: 'My Work',
  clientHome: 'My Orders',
  userHome: "Master's Eye",
  team: 'Team & Attendance',
  clients: 'Clients',
  orders: 'Orders & Designs',
  mill: 'Joinery Mill',
  payments: 'Payments',
  expenses: 'Consumables',
  console: 'Dev console',
  settings: 'Settings'
};

type Role = 'master' | 'vendor' | 'team' | 'client' | 'user';

export default function App() {
  const [state, setStateRaw] = useState<AppState>(() => loadState());
  const [page, setPage] = useState('dashboard');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { saveState(state); }, [state]);

  /* ── the Drive-as-server presence + cloud backup ───────────────────────
     Heartbeat keeps "online" live in the master's console; installs ping
     once per install (that counter is the download number); every settled
     change re-pushes the state file on a short debounce, so deleting the
     phone app costs nothing — log in again and the backup restores. */
  // Simple owner mode: no app authentication, device IDs, usernames or PINs.
  // Data ownership is handled by local persistence + the optional owner's Drive backup.
  const account: Account = { id: 'master', name: state.settings.masterName || 'Master', role: 'master', pinHash: '' };
  const myUser = 'master';

  useEffect(() => {
    if (!hasServer(state)) return;
    try {
      if (!localStorage.getItem('masters-eye-pinged')) {
        localStorage.setItem('masters-eye-pinged', '1');
        installPing(APP_VERSION);
      }
    } catch { /* private mode */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.settings.serverUrl]);

  useEffect(() => {
    if (!myUser || !hasServer(state)) return;
    heartbeat(myUser);
    const t = setInterval(() => { heartbeat(myUser); }, 60000);
    const vis = () => { if (document.visibilityState === 'visible') heartbeat(myUser); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myUser, state.settings.serverUrl]);

  useEffect(() => {
    if (!myUser || !hasServer(state)) return;
    const t = setTimeout(() => { backupState(myUser, state); }, 15000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const setState = (s: AppState) => setStateRaw(s);

  const role: Role = 'master';

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
    master: ['dashboard', 'team', 'clients', 'orders', 'mill', 'payments', 'expenses', 'console', 'settings'],
    vendor: ['vendorHome', 'settings'],
    team: ['mywork', 'settings'],
    client: ['clientHome', 'settings'],
    user: ['userHome', 'settings'],
  };
  const home: Record<Role, string> = {
    master: 'dashboard', vendor: 'vendorHome', team: 'mywork', client: 'clientHome', user: 'userHome',
  };
  const current = allowed[role].includes(page) ? page : home[role];
  const go = (p: string) => setPage(allowed[role].includes(p) ? p : home[role]);


  const body = () => {
    switch (current) {
      case 'vendorHome': return <VendorHome state={state} account={account} />;
      case 'mywork': return <MyWork state={state} account={account} />;
      case 'clientHome': return <ClientHome state={state} setState={setState} account={account} />;
      case 'userHome': return <UserHome state={state} account={account} onLogout={() => {}} />;
      case 'team': return <TeamPage state={state} setState={setState} />;
      case 'clients': return <ClientsPage state={state} setState={setState} />;
      case 'orders': return <OrdersPage state={state} setState={setState} />;
      case 'mill': return <MillPage state={state} setState={setState} />;
      case 'payments': return <PaymentsPage state={state} setState={setState} />;
      case 'expenses': return <ExpensesPage state={state} setState={setState} />;
      case 'console': return <Console state={state} setState={setState} />;
      case 'settings': return <SettingsPage state={state} setState={setState} sync={sync} syncing={syncing} account={account} role={role} onLogout={() => {}} onConsole={() => go('console')} />;
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
  ] : role === 'user' ? [
    { id: 'userHome', icon: Home, label: 'Home' },
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
            <div className="text-right leading-tight mr-1">
              <div className="text-[10px] font-black uppercase opacity-80 truncate max-w-[120px]">{state.settings.masterName || 'Master'}</div>
              <div className="text-[9px] font-bold uppercase opacity-50">owner</div>
            </div>
          </div>
        }
      />
      {body()}
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
