import React from 'react';
import { Users, Camera, ShoppingCart, TreePine, Wallet, Package, RefreshCw, Settings as Cog } from 'lucide-react';
import { AppState, today } from '../store';
import * as D from '../lib/derive';
import { money, BigButton } from '../components/ui';

type Props = { state: AppState; navigate: (p: string) => void; sync: () => void; syncing: boolean };

export default function Dashboard({ state, navigate, sync, syncing }: Props) {
  const ym = today().slice(0, 7);
  const due = D.toCollect(state);
  const vendorDebt = D.totalVendorDebt(state);
  const wages = D.crewWagesRemaining(state, ym);
  const inHand = D.cashInHand(state);

  return (
    <div className="p-4 space-y-4">
      <div className="bg-gradient-to-br from-wood-dark to-wood text-white rounded-3xl p-5 shadow-lg">
        <div className="text-[10px] font-black uppercase tracking-widest opacity-70">Client owes you</div>
        <div className="text-4xl font-black">₹ {money(due)}</div>
        <div className="grid grid-cols-4 gap-2 mt-4 text-center">
          <div className="bg-white/15 rounded-xl p-2"><div className="text-lg font-black">{state.clients.length}</div><div className="text-[9px] uppercase font-bold opacity-70">Clients</div></div>
          <div className="bg-white/15 rounded-xl p-2"><div className="text-lg font-black">{state.orders.length}</div><div className="text-[9px] uppercase font-bold opacity-70">Orders</div></div>
          <div className="bg-white/15 rounded-xl p-2"><div className="text-lg font-black">{state.workers.length + 1}</div><div className="text-[9px] uppercase font-bold opacity-70">Crew</div></div>
          <div className="bg-white/15 rounded-xl p-2"><div className="text-lg font-black">{state.woodLots.length}</div><div className="text-[9px] uppercase font-bold opacity-70">Lots</div></div>
        </div>
      </div>

      {/* three headline figures as full-width rows — long numbers can never clip */}
      <div className="bg-white rounded-3xl shadow p-4 divide-y divide-gray-100">
        <div className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <div className="font-black uppercase text-sm">Vendor udhar</div>
            <div className="text-[11px] font-bold text-gray-400">money you still owe for wood</div>
          </div>
          <div className="text-xl font-black text-red-600 whitespace-nowrap tabular-nums">₹{money(vendorDebt)}</div>
        </div>
        <div className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <div className="font-black uppercase text-sm">Wages due</div>
            <div className="text-[11px] font-bold text-gray-400">crew not paid this month</div>
          </div>
          <div className="text-xl font-black text-blue-600 whitespace-nowrap tabular-nums">₹{money(wages)}</div>
        </div>
        <div className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <div className="font-black uppercase text-sm">Cash in hand</div>
            <div className="text-[11px] font-bold text-gray-400">in − out − expenses</div>
          </div>
          <div className={`text-xl font-black whitespace-nowrap tabular-nums ${inHand < 0 ? 'text-red-600' : 'text-green-600'}`}>₹{money(inHand)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <BigButton icon={Users} label="Team & Attendance" color="bg-blue-600" onClick={() => navigate('team')} />
        <BigButton icon={Camera} label="Clients" color="bg-purple-600" onClick={() => navigate('clients')} />
        <BigButton icon={ShoppingCart} label="Orders" color="bg-orange-600" onClick={() => navigate('orders')} />
        <BigButton icon={TreePine} label="Wood Mill" color="bg-wood" onClick={() => navigate('mill')} />
        <BigButton icon={Wallet} label="Payments" color="bg-green-600" onClick={() => navigate('payments')} />
        <BigButton icon={Package} label="Consumables" color="bg-teal-600" onClick={() => navigate('expenses')} />
      </div>

      <button onClick={() => navigate('settings')}
        className="w-full py-4 rounded-2xl bg-white shadow border border-gray-200 text-gray-600 font-black uppercase flex items-center justify-center gap-3 active:scale-95">
        <Cog size={22} /> Settings
      </button>

      <button onClick={sync} disabled={syncing}
        className="w-full py-4 rounded-2xl bg-gray-900 text-white font-black uppercase flex items-center justify-center gap-3 active:scale-95 transition shadow-lg">
        <RefreshCw size={22} className={syncing ? 'animate-spin' : ''} />
        {syncing ? 'Backing up...' : 'Backup now'}
      </button>
      {state.lastSync && (
        <div className="text-center text-xs font-bold text-gray-400 uppercase">
          Last backup: {new Date(state.lastSync).toLocaleString()}
        </div>
      )}
    </div>
  );
}
