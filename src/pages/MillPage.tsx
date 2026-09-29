import React, { useState } from 'react';
import { Plus, TreePine, CreditCard, Users, Package } from 'lucide-react';
import { AppState, WoodLot, Vendor, today } from '../store';
import * as D from '../lib/derive';
import { money, Modal, Field, inputCls, MoneyField, ExportRow, PhotoInput, EditBtn, DeleteBtn, StatCard, WhatsAppBtn } from '../components/ui';
import { exportStockExcel, exportStockPdf } from '../lib/exporters';
import { vendorMessage } from '../lib/whatsapp';

type Props = { state: AppState; setState: (s: AppState) => void };

const blankLot = (vendorId: string) => ({ type: 'Teak', cubicFeet: 100, ratePerCubicFeet: 3200, vendorId, photo: '', date: today() });

export default function MillPage({ state, setState }: Props) {
  const [addingLot, setAddingLot] = useState(false);
  const [editingLot, setEditingLot] = useState<WoodLot | null>(null);
  const [lotDraft, setLotDraft] = useState<any>(blankLot(state.vendors[0]?.id || ''));

  const [addingVendor, setAddingVendor] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [vDraft, setVDraft] = useState({ name: '', phone: '', photo: '' });

  const [payVendor, setPayVendor] = useState<{ vendorId: string; lotId: string; due: number } | null>(null);
  const [payAmt, setPayAmt] = useState(0);

  const totalDebt = D.totalVendorDebt(state);
  const totalCubic = state.woodLots.reduce((a, l) => a + l.cubicFeet, 0);
  const totalValue = state.woodLots.reduce((a, l) => a + D.lotValue(l), 0);
  const colors: Record<string, string> = { Teak: 'bg-amber-700', Sheesham: 'bg-amber-900', Oak: 'bg-yellow-600', Pine: 'bg-lime-600', Walnut: 'bg-stone-700' };

  const saveLot = () => {
    if (!lotDraft.vendorId) { alert('Pick a vendor first.'); return; }
    const clean = {
      ...lotDraft,
      cubicFeet: Math.max(1, Number(lotDraft.cubicFeet) || 1),
      ratePerCubicFeet: Math.max(0, Number(lotDraft.ratePerCubicFeet) || 0)
    };
    if (editingLot) {
      const paid = D.paidToVendor(state, editingLot.id);
      if (clean.vendorId !== editingLot.vendorId && paid > 0) {
        alert('This lot already has payments — create a new lot instead of moving it to another vendor.');
        return;
      }
      const newLotValue = clean.cubicFeet * clean.ratePerCubicFeet;
      if (paid > newLotValue) {
        const ok = confirm(`You have already paid Rs ${money(paid)} but the new lot value is Rs ${money(newLotValue)} — save anyway?`);
        if (!ok) return;
      }
      setState({ ...state, woodLots: state.woodLots.map(l => l.id === editingLot.id ? { ...l, ...clean } : l) });
    }
    else setState({ ...state, woodLots: [...state.woodLots, { id: 'l' + Date.now() + Math.random().toString(36).slice(2, 6), ...clean } as WoodLot] });
    setAddingLot(false); setEditingLot(null);
  };

  const saveVendor = () => {
    if (editingVendor) setState({ ...state, vendors: state.vendors.map(v => v.id === editingVendor.id ? { ...v, ...vDraft } : v) });
    else setState({ ...state, vendors: [...state.vendors, { id: 'v' + Date.now() + Math.random().toString(36).slice(2, 6), ...vDraft }] });
    setAddingVendor(false); setEditingVendor(null);
  };

  const recordPayment = () => {
    if (!payVendor) return;
    let amt = payAmt;
    if (amt > payVendor.due) {
      const ok = confirm(`Lot balance is only Rs ${money(payVendor.due)} — record Rs ${money(payVendor.due)} instead?`);
      if (!ok) return;
      amt = payVendor.due;
    }
    if (amt <= 0) { alert('Enter how much you are paying.'); return; }
    setState({
      ...state,
      ledger: [...state.ledger, {
        id: 'led' + Date.now(), kind: 'out', bucket: 'vendor', refId: payVendor.lotId,
        vendorId: payVendor.vendorId, // stamped so this cash survives a lot deletion
        amount: amt, date: today(), note: 'Wood payment'
      }]
    });
    setPayVendor(null); setPayAmt(0);
  };

  const removeLot = (l: WoodLot) => {
    const due = D.lotDue(state, l.id);
    if (due > 0.5) { alert(`You still owe Rs ${due.toLocaleString('en-US')} on this lot. Settle it first, or keep the lot.`); return; }
    if (!confirm(`Delete this ${l.type} lot? Payments already made stay in the books.`)) return;
    setState({
      ...state,
      woodLots: state.woodLots.filter(x => x.id !== l.id),
      // stamp vendor + orphan flag so history survives the deletion
      ledger: state.ledger.map(e =>
        e.bucket === 'vendor' && e.refId === l.id
          ? D.markOrphaned({ ...e, vendorId: e.vendorId || l.vendorId })
          : e
      )
    });
  };

  const removeVendor = (v: Vendor) => {
    const lots = state.woodLots.filter(l => l.vendorId === v.id);
    if (lots.length) { alert('This vendor still has wood lots. Delete the lots first.'); return; }
    const paid = D.vendorPaid(state, v.id);
    if (paid > 0) { alert(`This vendor has payment history (Rs ${money(paid)} received). Keep the vendor so the records stay truthful.`); return; }
    if (!confirm(`Delete vendor ${v.name}?`)) return;
    setState({ ...state, vendors: state.vendors.filter(x => x.id !== v.id) });
  };

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={TreePine} label="Stock" value={`${totalCubic} ft³`} />
        <StatCard label="Value" value={`₹${money(totalValue)}`} accent="text-wood" />
        <StatCard icon={CreditCard} label="Vendor udhar (you owe)" value={`₹${money(totalDebt)}`} accent="text-red-600" />
      </div>

      <ExportRow onExcel={() => exportStockExcel(state)} onPdf={() => exportStockPdf(state)} />

      {/* Vendors */}
      <div className="bg-white rounded-3xl shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-black uppercase text-sm flex items-center gap-2"><Users size={16} /> Vendors</div>
          <button onClick={() => { setVDraft({ name: '', phone: '', photo: '' }); setEditingVendor(null); setAddingVendor(true); }}
            className="text-xs font-black uppercase text-wood bg-wood/10 px-3 py-2 rounded-xl active:scale-95 flex items-center gap-1">
            <Plus size={14} /> Add
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {state.vendors.map(v => (
            <div key={v.id} className="border-2 border-gray-100 rounded-2xl p-3">
              <div className="flex items-center gap-2">
                <img src={v.photo || 'https://i.pravatar.cc/150?u=' + v.id} className="w-12 h-12 rounded-full object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="font-black uppercase text-sm truncate">{v.name}</div>
                  <div className="text-[10px] font-bold text-gray-400">{v.phone || 'no number'}</div>
                </div>
                <EditBtn onClick={() => { setVDraft({ ...v }); setEditingVendor(v); setAddingVendor(true); }} size={14} />
                <DeleteBtn onClick={() => removeVendor(v)} />
              </div>
              <div className="mt-2 text-center">
                <div className="text-[9px] font-black uppercase text-gray-400">Balance due</div>
                <div className="font-black text-red-600">₹{money(D.vendorDue(state, v.id))}</div>
              </div>
              <WhatsAppBtn phone={v.phone} message={vendorMessage(state, v.id)} label="Statement" />
            </div>
          ))}
        </div>
      </div>

      {/* Wood lots */}
      <div className="space-y-3">
        {state.woodLots.map(l => {
          const value = D.lotValue(l);
          const paid = D.paidToVendor(state, l.id);
          const due = D.lotDue(state, l.id);
          const vendor = state.vendors.find(v => v.id === l.vendorId);
          const status = due <= 0 ? 'full' : paid > 0 ? 'partial' : 'credit';
          return (
            <div key={l.id} className="bg-white rounded-3xl p-4 shadow flex gap-3 border-l-8 border-wood">
              <div className={`w-14 rounded-xl shrink-0 flex items-center justify-center ${colors[l.type] || 'bg-gray-400'}`}>
                <TreePine size={24} className="text-white/70" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center gap-2">
                  <span className="font-black uppercase truncate">{l.type}</span>
                  <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg ${status === 'full' ? 'bg-green-100 text-green-700' : status === 'partial' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                    {status}
                  </span>
                </div>
                <div className="text-xs font-bold text-gray-400">
                  {l.cubicFeet} ft³ × ₹{money(l.ratePerCubicFeet)} · {vendor?.name || '—'}
                </div>
                <div className="flex justify-between mt-1 items-center">
                  <span className="font-black">₹{money(value)}</span>
                  <span className={`font-black ${due > 0 ? 'text-red-600' : 'text-green-600'}`}>{due > 0 ? `₹${money(due)}` : '✓ Paid'}</span>
                </div>
                <div className="text-[10px] font-bold text-gray-400">Paid Rs {money(paid)}</div>
                <div className="flex gap-1 mt-2">
                  <button onClick={() => { setLotDraft({ ...l }); setEditingLot(l); setAddingLot(true); }}
                    className="flex-1 py-2 rounded-xl bg-wood/10 text-wood text-[11px] font-black uppercase active:scale-95 flex items-center justify-center gap-1">
                    <Package size={13} /> Edit
                  </button>
                  <button onClick={() => { setPayVendor({ vendorId: l.vendorId, lotId: l.id, due }); setPayAmt(due); }}
                    disabled={due <= 0}
                    className={`flex-1 py-2 rounded-xl text-[11px] font-black uppercase active:scale-95 ${due > 0 ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-300'}`}>
                    Pay
                  </button>
                  <DeleteBtn onClick={() => removeLot(l)} />
                </div>
              </div>
              {l.photo && <img src={l.photo} className="w-14 h-14 rounded-xl object-cover self-start" />}
            </div>
          );
        })}

        <button onClick={() => { setLotDraft(blankLot(state.vendors[0]?.id || '')); setEditingLot(null); setAddingLot(true); }}
          className="w-full py-4 border-4 border-dashed border-wood text-wood font-black uppercase rounded-2xl active:scale-95 flex items-center justify-center gap-2">
          <Plus /> Record Wood Purchase
        </button>
      </div>

      {/* Lot modal */}
      <Modal open={addingLot} onClose={() => { setAddingLot(false); setEditingLot(null); }} title={editingLot ? 'Edit wood lot' : 'Wood purchase'}>
        <div className="flex justify-center mb-3">
          <PhotoInput size="w-24 h-24" round={false} value={lotDraft.photo} onChange={(v: string) => setLotDraft({ ...lotDraft, photo: v })} />
        </div>
        <Field label="Type">
          <div className="grid grid-cols-3 gap-2">
            {['Teak', 'Sheesham', 'Oak', 'Pine', 'Walnut'].map(t => (
              <button key={t} onClick={() => setLotDraft({ ...lotDraft, type: t })}
                className={`py-2 rounded-lg font-black text-sm uppercase ${lotDraft.type === t ? 'bg-wood text-white' : 'bg-gray-100 text-gray-500'}`}>{t}</button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity (ft³)"><input className={inputCls} type="number" value={lotDraft.cubicFeet} onChange={e => setLotDraft({ ...lotDraft, cubicFeet: +e.target.value })} /></Field>
          <MoneyField label="Rate per ft³" value={lotDraft.ratePerCubicFeet} onChange={(v: number) => setLotDraft({ ...lotDraft, ratePerCubicFeet: v })} />
        </div>
        <Field label="Vendor">
          <select className={inputCls} value={lotDraft.vendorId} onChange={e => setLotDraft({ ...lotDraft, vendorId: e.target.value })}>
            <option value="">— select —</option>
            {state.vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </Field>
        <div className="bg-wood/5 rounded-2xl p-3 text-center mb-3">
          <div className="text-[10px] font-black uppercase text-gray-400">Total value</div>
          <div className="text-2xl font-black text-wood">₹{money(Math.max(1, Number(lotDraft.cubicFeet) || 1) * Math.max(0, Number(lotDraft.ratePerCubicFeet) || 0))}</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => { setAddingLot(false); setEditingLot(null); }} className="py-4 rounded-2xl bg-gray-100 font-black uppercase active:scale-95">Cancel</button>
          <button onClick={saveLot} className="py-4 rounded-2xl bg-wood text-white font-black uppercase active:scale-95">Save</button>
        </div>
      </Modal>

      {/* Vendor modal */}
      <Modal open={addingVendor} onClose={() => { setAddingVendor(false); setEditingVendor(null); }} title={editingVendor ? 'Edit vendor' : 'New vendor'}>
        <div className="flex justify-center my-3">
          <PhotoInput size="w-24 h-24" value={vDraft.photo} onChange={(v: string) => setVDraft({ ...vDraft, photo: v })} />
        </div>
        <Field label="Vendor name"><input className={inputCls} value={vDraft.name} onChange={e => setVDraft({ ...vDraft, name: e.target.value })} /></Field>
        <Field label="WhatsApp number"><input className={inputCls} value={vDraft.phone} onChange={e => setVDraft({ ...vDraft, phone: e.target.value })} placeholder="03221112223" /></Field>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <button onClick={() => { setAddingVendor(false); setEditingVendor(null); }} className="py-4 rounded-2xl bg-gray-100 font-black uppercase active:scale-95">Cancel</button>
          <button onClick={saveVendor} className="py-4 rounded-2xl bg-wood text-white font-black uppercase active:scale-95">Save</button>
        </div>
      </Modal>

      {/* Pay vendor */}
      <Modal open={!!payVendor} onClose={() => setPayVendor(null)} title="Pay vendor">
        <div className="text-center my-4 space-y-3">
          <div className="text-sm font-bold text-gray-500">Due: <span className="text-red-600 font-black">₹{money(payVendor?.due || 0)}</span></div>
          <input className={inputCls + ' text-center text-3xl text-green-700'} type="number" value={payAmt} onChange={e => setPayAmt(+e.target.value)} />
          <div className="grid grid-cols-3 gap-2">
            {[10000, 50000, 100000].map(v => (
              <button key={v} onClick={() => setPayAmt(a => a + v)} className="py-3 bg-green-100 text-green-800 rounded-xl font-black active:scale-95">+{money(v)}</button>
            ))}
          </div>
        </div>
        <button onClick={recordPayment} className="w-full py-4 bg-green-600 text-white rounded-2xl font-black uppercase active:scale-95">
          Confirm Payment
        </button>
      </Modal>
    </div>
  );
}
