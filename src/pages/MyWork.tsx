import React, { useState } from 'react';
import { Users, Wallet, CheckCircle2 } from 'lucide-react';
import { AppState, monthLabel, today, Account } from '../store';
import * as D from '../lib/derive';
import { money, StatCard, WhatsAppBtn } from '../components/ui';
import Calendar from '../components/Calendar';
import { wageMessage } from '../lib/whatsapp';

type Props = { state: AppState; account: Account };

/* Team member's home — only THEIR days, THEIR rate, THEIR wages */
export default function MyWork({ state, account }: Props) {
  const worker = state.workers.find(w => w.id === account.workerId);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [selected, setSelected] = useState(today());
  const ym = month;

  if (!worker) {
    return (
      <div className="p-4 space-y-4">
        <div className="bg-white rounded-3xl shadow p-6 text-center">
          <div className="font-black uppercase text-sm text-gray-400">No worker linked</div>
          <div className="text-xs font-bold text-gray-400 mt-2">
            Ask the master to link this login to your crew record (Settings → Accounts).
          </div>
        </div>
      </div>
    );
  }

  const days = D.workerDays(state, worker.id, ym);
  const totalDays = D.workerDays(state, worker.id);
  const earned = days * worker.rate;
  const paid = D.paidWages(state, worker.id, ym);
  const balance = D.wageRemaining(state, worker.id, ym);
  const selectedLabel = new Date(selected + 'T00:00:00').toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' });
  const day = D.dayOf(state, selected);
  const presentToday = day.presentIds.includes(worker.id);

  return (
    <div className="p-4 space-y-4">
      <div className="bg-gradient-to-br from-wood-dark to-wood text-white rounded-3xl p-5 shadow-lg flex items-center gap-4">
        <img src={worker.photo || `https://i.pravatar.cc/150?u=${worker.id}`} className="w-16 h-16 rounded-full object-cover" alt="" />
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest opacity-70">Salam, worker</div>
          <div className="text-2xl font-black uppercase">{worker.name}</div>
          <div className="text-xs font-bold opacity-70">Rs {money(worker.rate)}/day</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Users} label={`Days (${monthLabel(ym).split(/[\s\u00A0]/)[0]})`} value={days} sub={`${totalDays} all time`} accent="text-blue-600" />
        <StatCard icon={Wallet} label="Earned this month" value={`₹ ${money(earned)}`} accent="text-blue-700" />
        <StatCard icon={CheckCircle2} label="Paid this month" value={`₹ ${money(paid)}`} accent="text-green-600" />
        <StatCard icon={Wallet} label="Still to receive" value={`₹ ${money(balance)}`} accent="text-red-600" />
      </div>

      <Calendar state={state} selected={selected} onSelect={d => { setSelected(d); setMonth(d.slice(0, 7)); }} month={month} onMonth={setMonth} />

      <div className={`rounded-3xl p-4 shadow border-2 text-center ${presentToday ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
        <div className="text-[10px] font-black uppercase text-gray-400">{selectedLabel}</div>
        <div className={`font-black uppercase text-lg mt-1 ${presentToday ? 'text-green-600' : 'text-gray-400'}`}>
          {presentToday ? '✓ Marked present' : 'Not marked'}
        </div>
        <div className="text-[11px] font-bold text-gray-400 mt-1">The master marks your attendance</div>
      </div>

      <div className="bg-white rounded-3xl shadow p-4">
        <div className="text-xs font-black uppercase text-gray-400 mb-3">Ask for your wage statement</div>
        <WhatsAppBtn phone={state.settings.whatsappNumber} message={wageMessage(state, worker.id, ym)} label="Send me my hisaab" />
      </div>
    </div>
  );
}
