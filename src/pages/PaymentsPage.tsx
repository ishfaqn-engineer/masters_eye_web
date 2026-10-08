import React, { useState } from 'react';
import { IndianRupee, Wallet, CreditCard, Users, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight, Pencil, Trash2, Banknote, Landmark } from 'lucide-react';
import { AppState, LedgerEntry, today, monthLabel, shiftMonth } from '../store';
import * as D from '../lib/derive';
import { money, ExportRow, StatCard, WhatsAppBtn, Modal, Field, inputCls, MoneyField } from '../components/ui';
import { exportPaymentsExcel, exportPaymentsPdf } from '../lib/exporters';
import { vendorMessage, clientMessage } from '../lib/whatsapp';

type Props = { state: AppState; setState: (s: AppState) => void };

/* at module scope so rows don't remount on every parent render */
const Row = ({ photo, name, sub, right, action }: any) => (
  <div className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
    {photo && <img src={photo} className="w-11 h-11 rounded-full object-cover" alt="" />}
    <div className="flex-1 min-w-0">
      <div className="font-bold uppercase truncate">{name}</div>
      <div className="text-[11px] text-gray-400 font-semibold">{sub}</div>
    </div>
    <div className="text-right shrink-0">{right}</div>
    {action}
  </div>
);

export default function PaymentsPage({ state, setState }: Props) {
  // wages settle month by month; you can step back to clear old dues
  const [wageMonth, setWageMonth] = useState(today().slice(0, 7));
  const ym = wageMonth;
  const collected = D.cashCollected(state);
  const fromClients = D.clientCollected(state);
  const paidOut = D.cashPaidOut(state);
  const toCollect = D.toCollect(state);
  const vendorDebt = D.totalVendorDebt(state);
  const wagesDue = D.crewWagesRemaining(state, ym);
  const wagesPaid = D.crewWagesPaid(state, ym);
  const expenses = D.expensesTotal(state);
  const inHand = D.cashInHand(state);

  // ledger row editing — every figure is derived, so fixing a row fixes the app
  const [editLed, setEditLed] = useState<LedgerEntry | null>(null);
  const [ledDraft, setLedDraft] = useState({ amount: 0, date: today(), note: '', method: '' as '' | 'cash' | 'online' });

  // wage settlement now asks HOW the money was handed over: cash or online —
  // and the amount is editable, so a partial month can settle part of the due
  const [payWage, setPayWage] = useState<{ id: string; name: string; ym: string; amount: number } | null>(null);
  const [payAmt, setPayAmt] = useState(0);
  const [payDate, setPayDate] = useState(today());

  // vendor settlement from this screen: enter any amount, oldest lots first
  const [payVendorFor, setPayVendorFor] = useState<{ vendorId: string; name: string; due: number } | null>(null);
  const [vendorAmt, setVendorAmt] = useState(0);
  const [vendorPayDate, setVendorPayDate] = useState(today());

  const openLedger = (l: LedgerEntry) => {
    setEditLed(l);
    setLedDraft({ amount: l.amount, date: l.date, note: l.note, method: l.method || '' });
  };

  const saveLedger = () => {
    if (!editLed) return;
    setState({
      ...state,
      ledger: state.ledger.map(l => l.id === editLed.id
        ? { ...l, amount: Math.max(0, ledDraft.amount), date: ledDraft.date || l.date, note: ledDraft.note, method: ledDraft.method || undefined }
        : l)
    });
    setEditLed(null);
  };

  const payNow = (method: 'cash' | 'online') => {
    if (!payWage) return;
    // clamp to what is still owed — one month can never be overpaid
    const amt = Math.max(0, payAmt);
    if (!(amt > 0)) return;
    setState({
      ...state,
      ledger: [...state.ledger, {
        id: 'led' + Date.now(), kind: 'out', bucket: 'wage', refId: payWage.id,
        amount: amt, date: payDate || today(), timestamp: new Date().toISOString(), ym: payWage.ym,
        note: `Wage payment ${monthLabel(payWage.ym)} · ${method}`, method
      }]
    });
    setPayWage(null); setPayAmt(0); setPayDate(today());
  };

  /* vendor payment with an editable amount — the cash is split across this
     vendor's open wood lots (oldest first), one ledger row per lot, so the
     per-lot maths and every consistency check stay exact */
  const recordVendorPayment = (method: 'cash' | 'online') => {
    if (!payVendorFor) return;
    let left = Math.max(0, vendorAmt);
    if (!(left > 0)) return;
    const openLots = state.woodLots
      .filter(l => l.vendorId === payVendorFor.vendorId)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(l => ({ lot: l, rem: Math.max(0, D.lotValue(l) - D.paidToVendor(state, l.id)) }))
      .filter(x => x.rem > 0);
    const rows: LedgerEntry[] = [];
    const stamp = Date.now();
    for (const { lot, rem } of openLots) {
      if (left <= 0) break;
      const take = Math.min(rem, left);
      rows.push({
        id: `led${stamp}-${rows.length}`, kind: 'out', bucket: 'vendor', refId: lot.id,
        vendorId: payVendorFor.vendorId, amount: take, date: vendorPayDate || today(), timestamp: new Date().toISOString(),
        note: `Wood payment · ${method}`, method
      });
      left -= take;
    }
    if (left > 0 && openLots.length) rows.push({ id: `led${stamp}-advance`, kind: 'out', bucket: 'vendor', refId: openLots[0].lot.id, vendorId: payVendorFor.vendorId, amount: left, date: vendorPayDate || today(), timestamp: new Date().toISOString(), note: `Vendor advance · ${method}`, method });
    if (rows.length) setState({ ...state, ledger: [...state.ledger, ...rows] });
    setPayVendorFor(null); setVendorAmt(0); setVendorPayDate(today());
  };

  const deleteLedger = () => {
    if (!editLed) return;
    if (!confirm(`Delete this entry of Rs ${money(editLed.amount)}? All totals will update.`)) return;
    setState({ ...state, ledger: state.ledger.filter(l => l.id !== editLed.id) });
    setEditLed(null);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="bg-gradient-to-br from-wood-dark to-wood text-white rounded-3xl p-5 shadow-lg">
        <div className="text-[10px] font-black uppercase tracking-widest opacity-70">Cash in hand</div>
        <div className="text-4xl font-black">₹ {money(inHand)}</div>
        <div className="grid grid-cols-4 gap-2 mt-4 text-center">
          <div className="bg-white/15 rounded-xl p-2"><div className="text-sm font-black">{money(collected)}</div><div className="text-[8px] uppercase font-bold opacity-70">Total in</div></div>
          <div className="bg-white/15 rounded-xl p-2"><div className="text-sm font-black">{money(toCollect)}</div><div className="text-[8px] uppercase font-bold opacity-70">Due</div></div>
          <div className="bg-white/15 rounded-xl p-2"><div className="text-sm font-black">{money(vendorDebt)}</div><div className="text-[8px] uppercase font-bold opacity-70">Udhar</div></div>
          <div className="bg-white/15 rounded-xl p-2"><div className="text-sm font-black">{money(wagesDue)}</div><div className="text-[8px] uppercase font-bold opacity-70">Wages {monthLabel(ym).split(' ')[0]}</div></div>
        </div>
        <div className="mt-3 text-[11px] font-bold opacity-80 text-center">
          ₹{money(collected)} in − ₹{money(paidOut)} paid out − ₹{money(expenses)} expenses
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={IndianRupee} label="From clients" value={`₹ ${money(fromClients)}`} accent="text-green-600" />
        <StatCard icon={Wallet} label="To collect" value={`₹ ${money(toCollect)}`} accent="text-red-600" />
        <StatCard icon={CreditCard} label="Vendor udhar" value={`₹ ${money(vendorDebt)}`} accent="text-orange-600" />
        <StatCard icon={Users} label={`Wages due (${monthLabel(ym).split(' ')[0]})`} value={`₹ ${money(wagesDue)}`} accent="text-blue-600" />
        <StatCard icon={AlertTriangle} label="Expenses (all time)" value={`₹ ${money(expenses)}`} accent="text-teal-600" />
        <StatCard icon={CheckCircle2} label={`Wages paid (${monthLabel(ym).split(' ')[0]})`} value={`₹ ${money(wagesPaid)}`} accent="text-green-600" />
      </div>

      <ExportRow onExcel={() => exportPaymentsExcel(state, ym)} onPdf={() => exportPaymentsPdf(state)} />

      {/* Clients */}
      <div className="bg-white rounded-3xl p-4 shadow">
        <div className="text-xs font-black uppercase text-gray-400 mb-2">Clients — money owed to you</div>
        {state.clients.map(c => {
          const due = D.clientDue(state, c);
          return (
            <Row key={c.id}
              photo={c.photo}
              name={c.name}
              sub={`order ₹${money(D.clientTotal(state, c))} · received ₹${money(D.clientPaid(state, c))}`}
              right={<span className={`font-black ${due > 0 ? 'text-red-600' : 'text-green-600'}`}>{due > 0 ? `₹${money(due)}` : '✓'}</span>}
              action={<WhatsAppBtn phone={c.phone} message={clientMessage(state, c.id)} label="Ask" />}
            />
          );
        })}
      </div>

      {/* Vendors */}
      <div className="bg-white rounded-3xl p-4 shadow">
        <div className="text-xs font-black uppercase text-gray-400 mb-2">Vendors — money you owe</div>
        {state.vendors.map(v => {
          const due = D.vendorDue(state, v.id);
          const paid = D.vendorPaid(state, v.id);
          return (
            <Row key={v.id}
              photo={v.photo}
              name={v.name}
              sub={`paid ₹${money(paid)} · balance ₹${money(due)}`}
              right={<span className={`font-black ${due > 0 ? 'text-red-600' : 'text-green-600'}`}>{due > 0 ? `₹${money(due)}` : '✓'}</span>}
              action={
                <div className="flex items-center gap-1.5">
                  {due > 0 && (
                    <button
                      onClick={() => { setPayVendorFor({ vendorId: v.id, name: v.name, due }); setVendorAmt(due); setVendorPayDate(today()); }}
                      className="py-2 px-3 bg-green-600 text-white rounded-xl text-[11px] font-black uppercase active:scale-95"
                    >Pay</button>
                  )}
                  <WhatsAppBtn phone={v.phone} message={vendorMessage(state, v.id)} label="Send" />
                </div>
              }
            />
          );
        })}
      </div>

      {/* Wages — always month by month, same maths as Team page */}
      <div className="bg-white rounded-3xl p-4 shadow">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setWageMonth(m => shiftMonth(m, -1))}
            className="p-2 bg-gray-100 rounded-xl active:scale-90" title="Previous month">
            <ChevronLeft size={20} />
          </button>
          <div className="text-center">
            <div className="text-xs font-black uppercase text-gray-400">Wages</div>
            <div className="font-black uppercase">{monthLabel(ym)}</div>
          </div>
          <button onClick={() => setWageMonth(m => shiftMonth(m, 1))}
            className="p-2 bg-gray-100 rounded-xl active:scale-90" title="Next month">
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="text-[11px] font-bold text-gray-400 mb-3 text-center">Money you owe your crew for this month</div>
        {[{ id: 'master', name: state.settings.masterName, photo: state.settings.masterPhoto, rate: state.settings.masterRate }, ...state.workers].map(w => {
          const days = w.id === 'master' ? D.masterDays(state, ym) : D.workerDays(state, w.id, ym);
          const earned = days * w.rate;
          const paid = D.paidWages(state, w.id, ym);
          const balance = Math.max(0, earned - paid);
          return (
            <Row key={w.id}
              photo={w.photo}
              name={w.name}
              sub={`${days} days × ₹${money(w.rate)} = ₹${money(earned)} · paid ₹${money(paid)}`}
              right={<span className={`font-black ${balance > 0 ? 'text-blue-600' : 'text-green-600'}`}>{balance > 0 ? `₹${money(balance)}` : '✓'}</span>}
              action={
                balance > 0 ? (
                  <button
                    onClick={() => { setPayWage({ id: w.id, name: w.name, ym, amount: balance }); setPayAmt(balance); setPayDate(today()); }}
                    className="py-2 px-3 bg-blue-600 text-white rounded-xl text-[11px] font-black uppercase active:scale-95"
                  >Pay</button>
                ) : <CheckCircle2 size={20} className="text-green-500" />
              }
            />
          );
        })}
      </div>

      {/* Own capital */}
      <div className="bg-white rounded-3xl p-4 shadow">
        <div className="text-xs font-black uppercase text-gray-400 mb-2">Your own money in the business</div>
        <div className="text-2xl font-black text-wood mb-3">₹ {money(D.capitalIn(state))}</div>
        <button
          onClick={() => {
            const v = Number(prompt('How much of your own cash are you putting in?', '0') || 0);
            if (!(v > 0)) return;
            setState({
              ...state,
              ledger: [...state.ledger, {
                id: 'led' + Date.now(), kind: 'in', bucket: 'capital', refId: 'master',
                amount: v, date: today(), timestamp: new Date().toISOString(), note: 'Own money put in'
              }]
            });
          }}
          className="w-full py-3 rounded-2xl bg-wood/10 text-wood font-black uppercase active:scale-95"
        >+ Add your own money</button>
        <div className="text-[10px] text-gray-400 font-bold mt-2">Only counted as cash in hand — never as client payment.</div>
      </div>

      {/* Recent ledger — tap any row to correct it */}
      <div className="bg-white rounded-3xl p-4 shadow">
        <div className="text-xs font-black uppercase text-gray-400 mb-2">Last transactions — tap to edit</div>
        {[...state.ledger].reverse().slice(0, 12).map(l => {
          const ref = l.bucket === 'client' ? state.clients.find(c => c.id === l.refId)?.name
            : l.bucket === 'vendor' ? `${state.woodLots.find(x => x.id === l.refId)?.type || 'Wood'} lot`
              : l.bucket === 'wage' ? (l.refId === 'master' ? state.settings.masterName : state.workers.find(w => w.id === l.refId)?.name)
                : l.bucket === 'capital' ? 'Own capital'
                  : 'Expense';
          return (
            <button key={l.id} onClick={() => openLedger(l)}
              className="w-full flex items-center gap-3 py-2 border-b border-gray-100 last:border-0 text-left active:bg-gray-50">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${l.kind === 'in' ? 'bg-green-100' : 'bg-red-100'}`}>
                <IndianRupee size={18} className={l.kind === 'in' ? 'text-green-600' : 'text-red-600'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm capitalize truncate">{l.bucket} · {ref || '—'}</div>
                <div className="text-[11px] text-gray-400 truncate flex items-center gap-1">
                  <span className="truncate">{l.date}{l.timestamp ? ` · ${new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''} · {l.note}</span>
                  {l.method && (
                    <span className={`text-[9px] font-black uppercase px-1 rounded shrink-0 ${l.method === 'online' ? 'bg-blue-50 text-blue-500' : 'bg-green-50 text-green-600'}`}>
                      {l.method}
                    </span>
                  )}
                </div>
              </div>
              <div className={`font-black shrink-0 ${l.kind === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                {l.kind === 'in' ? '+' : '−'}₹{money(l.amount)}
              </div>
              <Pencil size={14} className="text-gray-300 shrink-0" />
            </button>
          );
        })}
        {!state.ledger.length && <div className="text-center text-gray-300 font-bold py-4">No transactions yet</div>}
      </div>

      <Modal open={!!editLed} onClose={() => setEditLed(null)} title="Edit transaction">
        {editLed && (
          <>
            <div className={`text-center font-black uppercase mb-3 ${editLed.kind === 'in' ? 'text-green-600' : 'text-red-600'}`}>
              {editLed.kind === 'in' ? 'Money in' : 'Money out'} · {editLed.bucket}
            </div>
            <MoneyField label="Amount" value={ledDraft.amount} onChange={(v: number) => setLedDraft({ ...ledDraft, amount: v })} />
            <Field label="Date">
              <input type="date" className={inputCls} value={ledDraft.date} onChange={e => setLedDraft({ ...ledDraft, date: e.target.value })} />
            </Field>
            <Field label="Note">
              <input className={inputCls} value={ledDraft.note} onChange={e => setLedDraft({ ...ledDraft, note: e.target.value })} />
            </Field>
            <div className="mb-3">
              <span className="text-xs font-black uppercase text-gray-400 block mb-1">Payment method</span>
              <div className="grid grid-cols-3 gap-2">
                {([['', 'Not set'], ['cash', 'Cash'], ['online', 'Online']] as const).map(([v, lab]) => (
                  <button key={lab} onClick={() => setLedDraft({ ...ledDraft, method: v })}
                    className={`py-2.5 rounded-xl font-black uppercase text-xs active:scale-95 border-2 ${ledDraft.method === v ? 'bg-wood text-white border-wood' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
                    {lab}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <button onClick={deleteLedger}
                className="py-4 rounded-2xl bg-red-50 text-red-600 font-black uppercase active:scale-95 flex items-center justify-center gap-2">
                <Trash2 size={18} /> Delete
              </button>
              <button onClick={saveLedger}
                className="py-4 rounded-2xl bg-wood text-white font-black uppercase active:scale-95">Save</button>
            </div>
            <div className="text-[10px] text-gray-400 font-bold text-center mt-2">
              Every figure in the app updates the moment you save.
            </div>
          </>
        )}
      </Modal>

      {/* Wage settlement — editable amount, then cash or online */}
      <Modal open={!!payWage} onClose={() => setPayWage(null)} title={payWage ? `Pay ${payWage.name}` : 'Pay'}>
        {payWage && (
          <div className="my-2 space-y-3">
            <div className="text-center">
              <div className="text-xs font-black uppercase text-gray-400">{monthLabel(payWage.ym)}</div>
              <div className="text-sm font-black text-blue-600 mt-1">Due ₹{money(payWage.amount)}</div>
            </div>
            <MoneyField label="Amount you are paying" value={payAmt} onChange={(v: number) => setPayAmt(v)} />
            <Field label="Payment date">
              <input type="date" className={inputCls} value={payDate} onChange={e => setPayDate(e.target.value)} />
            </Field>
            <div className="text-center text-[11px] font-bold text-gray-400">
              {payAmt < payWage.amount
                ? `Partial — leaves ₹${money(payWage.amount - payAmt)} due this month`
                : payAmt > payWage.amount
                  ? `Advance of ₹${money(payAmt - payWage.amount)} will be recorded`
                  : 'Full settlement of this month'}
            </div>
            <div className="text-xs font-bold text-gray-400 text-center">How did {payWage.name} take the money?</div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => payNow('cash')}
                className="py-5 rounded-2xl bg-green-600 text-white font-black uppercase active:scale-95 flex flex-col items-center gap-1.5">
                <Banknote size={26} /> Cash
              </button>
              <button onClick={() => payNow('online')}
                className="py-5 rounded-2xl bg-blue-600 text-white font-black uppercase active:scale-95 flex flex-col items-center gap-1.5">
                <Landmark size={24} /> Online
              </button>
            </div>
            <div className="text-[10px] font-bold text-gray-400">Each payment is saved as a separate history entry. The selected payment date and the exact recording time are both preserved.</div>
            <button onClick={() => setPayWage(null)} className="w-full py-3 rounded-2xl bg-gray-100 font-black uppercase active:scale-95">Cancel</button>
          </div>
        )}
      </Modal>

      {/* Vendor settlement — pay any part of what you owe, oldest lots first */}
      <Modal open={!!payVendorFor} onClose={() => setPayVendorFor(null)} title={payVendorFor ? `Pay ${payVendorFor.name}` : 'Pay vendor'}>
        {payVendorFor && (
          <div className="my-2 space-y-3">
            <div className="text-center">
              <div className="text-xs font-black uppercase text-gray-400">You owe</div>
              <div className="text-3xl font-black text-red-600">₹ {money(payVendorFor.due)}</div>
            </div>
            <MoneyField label="Amount you are paying" value={vendorAmt} onChange={(v: number) => setVendorAmt(v)} />
            <Field label="Payment date">
              <input type="date" className={inputCls} value={vendorPayDate} onChange={e => setVendorPayDate(e.target.value)} />
            </Field>
            <div className="text-center text-[11px] font-bold text-gray-400">
              {vendorAmt < payVendorFor.due
                ? `Partial — leaves ₹${money(payVendorFor.due - vendorAmt)} on credit`
                : vendorAmt > payVendorFor.due
                  ? `Advance of ₹${money(vendorAmt - payVendorFor.due)} will be recorded`
                  : 'Full settlement — balance clears to ✓'}
            </div>
            <div className="text-[10px] font-bold text-gray-400 text-center">Applied to the oldest wood lots first.</div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => recordVendorPayment('cash')}
                className="py-5 rounded-2xl bg-green-600 text-white font-black uppercase active:scale-95 flex flex-col items-center gap-1.5">
                <Banknote size={26} /> Cash
              </button>
              <button onClick={() => recordVendorPayment('online')}
                className="py-5 rounded-2xl bg-blue-600 text-white font-black uppercase active:scale-95 flex flex-col items-center gap-1.5">
                <Landmark size={24} /> Online
              </button>
            </div>
            <button onClick={() => setPayVendorFor(null)} className="w-full py-3 rounded-2xl bg-gray-100 font-black uppercase active:scale-95">Cancel</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
