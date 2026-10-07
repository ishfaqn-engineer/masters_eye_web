import React from 'react';
import { Users, Camera, ShoppingCart, TreePine, Wallet, Package, RefreshCw, Settings as Cog, AlertTriangle, Activity, CheckCircle2 } from 'lucide-react';
import { AppState, today, monthLabel } from '../store';
import * as D from '../lib/derive';
import { money, BigButton, WhatsAppBtn } from '../components/ui';
import { clientMessage, vendorMessage, wageMessage } from '../lib/whatsapp';

type Props = { state: AppState; navigate: (p: string) => void; sync: () => void; syncing: boolean };

export default function Dashboard({ state, navigate, sync, syncing }: Props) {
  const ym = today().slice(0, 7);
  const due = D.toCollect(state);
  const vendorDebt = D.totalVendorDebt(state);
  const wages = D.crewWagesRemaining(state, ym);
  const inHand = D.cashInHand(state);

  /* month profit & stock analytics */
  const mIn = D.monthIn(state, ym);
  const mOut = D.monthOut(state, ym);
  const mProfit = D.monthProfit(state, ym);
  const trend = D.monthTrend(state, 6);
  const maxV = Math.max(1, ...trend.flatMap(t => [t.in, t.out]));
  const stages = D.stageValues(state);
  const stock = D.woodStockCft(state);
  const lowLots = D.lowStockLots(state);
  const shortMonth = (k: string) => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, 1).toLocaleString('en', { month: 'short' });

  /* dues reminder rows — clients, suppliers, crew in one place */
  const dueClients = state.clients.map(c => ({ c, d: D.clientDue(state, c) })).filter(x => x.d > 0);
  const dueVendors = state.vendors.map(v => ({ v, d: D.vendorDue(state, v.id) })).filter(x => x.d > 0);
  const dueWages = state.workers.map(w => ({ w, d: D.wageRemaining(state, w.id, ym) })).filter(x => x.d > 0);
  const hasDues = dueClients.length + dueVendors.length + dueWages.length > 0;
  const checks = D.runChecks(state);
  const badChecks = checks.filter(c => !c.ok);
  const recent = [...state.ledger].sort((a,b) => (b.timestamp || b.date).localeCompare(a.timestamp || a.date)).slice(0, 6);
  const refName = (l: any) => l.bucket === 'client'
    ? state.clients.find(c => c.id === l.refId)?.name || 'Deleted client'
    : l.bucket === 'wage'
      ? (l.refId === 'master' ? state.settings.masterName : state.workers.find(w => w.id === l.refId)?.name || 'Deleted worker')
      : l.bucket === 'vendor'
        ? state.vendors.find(v => v.id === l.vendorId)?.name || 'Vendor'
        : l.bucket === 'capital' ? 'Owner capital' : l.note;

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

      {/* this month: received vs spent vs what's actually left */}
      <div className="bg-white rounded-3xl shadow p-4">
        <div className="flex items-baseline justify-between mb-3">
          <div className="font-black uppercase text-sm">This month</div>
          <div className="text-[11px] font-bold text-gray-400">{monthLabel(ym)}</div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-green-50 rounded-xl p-2">
            <div className="text-lg font-black text-green-600 tabular-nums">₹{money(mIn)}</div>
            <div className="text-[9px] font-black uppercase text-green-700/70">received</div>
          </div>
          <div className="bg-red-50 rounded-xl p-2">
            <div className="text-lg font-black text-red-600 tabular-nums">₹{money(mOut)}</div>
            <div className="text-[9px] font-black uppercase text-red-700/70">spent</div>
          </div>
          <div className={`${mProfit < 0 ? 'bg-red-50' : 'bg-gray-50'} rounded-xl p-2`}>
            <div className={`text-lg font-black tabular-nums ${mProfit < 0 ? 'text-red-600' : 'text-green-600'}`}>₹{money(mProfit)}</div>
            <div className="text-[9px] font-black uppercase text-gray-500">profit</div>
          </div>
        </div>
        <div className="text-[11px] font-bold text-gray-400 mt-2 text-center">
          ₹{money(stages.done)} delivered · ₹{money(stages.active)} in progress
        </div>
      </div>

      {/* six-month in/out bars */}
      <div className="bg-white rounded-3xl shadow p-4">
        <div className="font-black uppercase text-sm mb-3">Last 6 months</div>
        <div className="grid grid-cols-6 gap-2">
          {trend.map(t => (
            <div key={t.ym} className="flex flex-col items-center gap-1">
              <div className="flex items-end justify-center gap-1 h-16 w-full">
                <div className="w-3 rounded-t bg-green-500" style={{ height: `${Math.max(t.in > 0 ? 4 : 2, (t.in / maxV) * 100)}%` }} />
                <div className="w-3 rounded-t bg-red-300" style={{ height: `${Math.max(t.out > 0 ? 4 : 2, (t.out / maxV) * 100)}%` }} />
              </div>
              <div className="text-[9px] font-black uppercase text-gray-400">{shortMonth(t.ym)}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-4 mt-2 text-[10px] font-black uppercase text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500" /> received</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-300" /> spent</span>
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

      {/* yard stock + dry-lot alert */}
      <div className="bg-white rounded-3xl shadow p-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="bg-wood/10 p-2 rounded-xl"><TreePine size={20} className="text-wood" /></div>
          <div className="min-w-0">
            <div className="font-black uppercase text-sm">Wood stock</div>
            <div className="text-[11px] font-bold text-gray-400">{stock.toLocaleString('en-US')} ft³ across {state.woodLots.length} lots</div>
          </div>
        </div>
        {lowLots.length > 0 && (
          <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-2.5">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div className="text-[11px] font-black uppercase">
              Low stock: {lowLots.map(l => `${l.type} ${l.cubicFeet} ft³`).join(' · ')}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-3xl shadow p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-black uppercase text-sm flex items-center gap-2"><Activity size={17}/> Recent activity</div>
          <button onClick={() => navigate('payments')} className="text-[10px] font-black uppercase text-green-600">Open money</button>
        </div>
        <div className="divide-y divide-gray-100">
          {recent.map(l => (
            <div key={l.id} className="flex items-center gap-3 py-2">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black ${l.kind === 'in' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                {l.kind === 'in' ? '+' : '−'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-black truncate">{refName(l)}</div>
                <div className="text-[10px] font-bold text-gray-400 truncate">{l.date}{l.timestamp ? ` · ${new Date(l.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}` : ''} · {l.note}</div>
              </div>
              <div className={`font-black text-sm ${l.kind === 'in' ? 'text-green-600' : 'text-red-600'}`}>₹{money(l.amount)}</div>
            </div>
          ))}
          {!recent.length && <div className="text-center text-gray-300 font-bold py-4 text-xs">No activity yet</div>}
        </div>
      </div>

      <div className={`rounded-3xl shadow p-4 ${badChecks.length ? 'bg-amber-50 border border-amber-200' : 'bg-white'}`}>
        <div className="font-black uppercase text-sm flex items-center gap-2">
          {badChecks.length ? <AlertTriangle size={17} className="text-amber-600"/> : <CheckCircle2 size={17} className="text-green-600"/>}
          Data health
        </div>
        <div className="text-[11px] font-bold text-gray-500 mt-1">
          {badChecks.length ? `${badChecks.length} issue${badChecks.length === 1 ? '' : 's'} need attention` : 'Records are internally consistent'}
        </div>
        {badChecks.slice(0,3).map(c => <div key={c.label} className="text-[10px] font-bold text-amber-700 mt-1">• {c.label}: {c.detail}</div>)}
      </div>

      {/* one-tap WhatsApp reminders for every open balance */}
      {hasDues && (
        <div className="bg-white rounded-3xl shadow p-4">
          <div className="font-black uppercase text-sm">Remind dues</div>
          <div className="text-[11px] font-bold text-gray-400 mb-1">one tap opens WhatsApp with the exact balance</div>
          <div className="divide-y divide-gray-100">
            {dueClients.map(({ c, d }) => (
              <div key={'c' + c.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="font-black text-sm truncate">{c.name}</div>
                  <div className="text-[11px] font-bold text-gray-400">client · ₹{money(d)} due</div>
                </div>
                <WhatsAppBtn compact phone={c.phone} message={clientMessage(state, c.id)} label="Remind" />
              </div>
            ))}
            {dueVendors.map(({ v, d }) => (
              <div key={'v' + v.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="font-black text-sm truncate">{v.name}</div>
                  <div className="text-[11px] font-bold text-gray-400">wood supplier · ₹{money(d)} due</div>
                </div>
                <WhatsAppBtn compact phone={v.phone} message={vendorMessage(state, v.id)} label="Remind" />
              </div>
            ))}
            {dueWages.map(({ w, d }) => (
              <div key={'w' + w.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="font-black text-sm truncate">{w.name}</div>
                  <div className="text-[11px] font-bold text-gray-400">wages · ₹{money(d)} this month</div>
                </div>
                <WhatsAppBtn compact phone={w.phone} message={wageMessage(state, w.id, ym)} label="Remind" />
              </div>
            ))}
          </div>
        </div>
      )}

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
