import React from 'react';
import { TreePine, Wallet, MessageCircle } from 'lucide-react';
import { AppState, monthLabel, today, Account } from '../store';
import * as D from '../lib/derive';
import { money, StatCard, WhatsAppBtn } from '../components/ui';
import { vendorMessage } from '../lib/whatsapp';

type Props = { state: AppState; account: Account };

/* Vendor's home — read-only view of THEIR wood, what they got paid, what's left */
export default function VendorHome({ state, account }: Props) {
  const vendor = state.vendors.find(v => v.id === account.vendorId);
  const ym = today().slice(0, 7);
  const lots = vendor ? state.woodLots.filter(l => l.vendorId === vendor.id) : [];
  const due = vendor ? D.vendorDue(state, vendor.id) : 0;
  const paid = vendor ? D.vendorPaid(state, vendor.id) : 0;

  if (!vendor) {
    return (
      <div className="p-4 space-y-4">
        <div className="bg-white rounded-3xl shadow p-6 text-center">
          <div className="font-black uppercase text-sm text-gray-400">No vendor linked</div>
          <div className="text-xs font-bold text-gray-400 mt-2">
            Ask the master to link this login to your vendor record (Settings → Accounts).
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="bg-gradient-to-br from-wood-dark to-wood text-white rounded-3xl p-5 shadow-lg flex items-center gap-4">
        <img src={vendor.photo || `https://i.pravatar.cc/150?u=${vendor.id}`} className="w-16 h-16 rounded-full object-cover" alt="" />
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest opacity-70">Welcome back</div>
          <div className="text-2xl font-black uppercase">{vendor.name}</div>
          <div className="text-xs font-bold opacity-70">Vendor account</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Wallet} label="Paid to you" value={`₹ ${money(paid)}`} accent="text-green-600" />
        <StatCard icon={Wallet} label="Balance" value={`₹ ${money(due)}`} accent={due > 0 ? 'text-red-600' : 'text-green-600'} />
      </div>

      <div className="bg-white rounded-3xl shadow p-4">
        <div className="flex items-center gap-2 font-black uppercase text-sm mb-3">
          <TreePine size={16} className="text-wood" /> Your wood lots
        </div>
        {!lots.length && <div className="text-center text-gray-300 font-bold py-4">No lots yet</div>}
        <div className="space-y-2">
          {lots.map(l => {
            const lotPaid = D.paidToVendor(state, l.id);
            const lotDue = D.lotDue(state, l.id);
            return (
              <div key={l.id} className="border-2 border-gray-100 rounded-2xl p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-black uppercase">{l.type}</div>
                  <div className="text-xs font-bold text-gray-400">{l.date}</div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2 text-center text-xs font-bold">
                  <div className="bg-gray-50 rounded-xl py-2">
                    <div className="text-[9px] uppercase text-gray-400 font-black">Value</div>
                    <div className="font-black">{money(D.lotValue(l))}</div>
                  </div>
                  <div className="bg-green-50 rounded-xl py-2">
                    <div className="text-[9px] uppercase text-green-400 font-black">Paid</div>
                    <div className="font-black text-green-700">{money(lotPaid)}</div>
                  </div>
                  <div className="bg-red-50 rounded-xl py-2">
                    <div className="text-[9px] uppercase text-red-400 font-black">Balance</div>
                    <div className="font-black text-red-600">{money(lotDue)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow p-4">
        <div className="text-xs font-black uppercase text-gray-400 mb-3">Message the master</div>
        <WhatsAppBtn phone={state.settings.whatsappNumber} message={vendorMessage(state, vendor.id)} label="Send statement" />
      </div>

      <div className="text-center text-[11px] font-bold text-gray-400 uppercase">
        {monthLabel(ym)} · balances update when the master records payments
      </div>
    </div>
  );
}
