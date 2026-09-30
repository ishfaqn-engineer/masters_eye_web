import React, { useState } from 'react';
import { Camera, Wallet, Phone, IndianRupee, CheckCircle2, Package } from 'lucide-react';
import { AppState, Client, today, OrderStatus, orderHeadline } from '../store';
import * as D from '../lib/derive';
import { removeFile } from '../lib/files';
import { money, Modal, Field, inputCls, PhotoInput, MoneyField, WhatsAppBtn, EditBtn, DeleteBtn, StatCard } from '../components/ui';
import { SpecSummary } from '../components/SpecEditor';
import { clientMessage } from '../lib/whatsapp';

type Props = { state: AppState; setState: (s: AppState) => void };

const blank = () => ({ name: '', photo: '', phone: '', notes: '', advancePaid: 0, totalOrderValue: 0 });

const stageChip: Record<OrderStatus, string> = {
  pending: 'bg-gray-100 text-gray-500',
  cutting: 'bg-orange-100 text-orange-600',
  polish: 'bg-blue-100 text-blue-600',
  installed: 'bg-purple-100 text-purple-600',
  delivered: 'bg-green-100 text-green-600',
};

export default function ClientsPage({ state, setState }: Props) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [draft, setDraft] = useState<any>(blank());
  const [payFor, setPayFor] = useState<Client | null>(null);
  const [ordersFor, setOrdersFor] = useState<Client | null>(null);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');

  const openAdd = () => { setDraft(blank()); setEditing(null); setAdding(true); };
  const openEdit = (c: Client) => { setDraft({ ...c }); setEditing(c); setAdding(true); };

  const save = () => {
    if (!draft.photo && !editing) { alert('Please take a photo of the client first'); return; }
    const { advancePaid, ...rest } = draft;
    if (editing) {
      setState({ ...state, clients: state.clients.map(c => c.id === editing.id ? { ...c, ...rest } : c) });
    } else {
      const id = 'c' + Date.now();
      const taken = new Set(state.clients.map(x => x.name));
      let n = state.clients.length + 1;
      let auto = 'Client ' + n;
      while (taken.has(auto)) { n += 1; auto = 'Client ' + n; }
      const client: Client = { id, ...rest, name: rest.name || auto };
      const advance = Number(advancePaid) > 0 ? Number(advancePaid) : 0;
      setState({
        ...state,
        clients: [...state.clients, client],
        // advance becomes a real ledger row so it can never be double counted
        ledger: advance > 0
          ? [...state.ledger, { id: 'led' + Date.now(), kind: 'in', bucket: 'client', refId: id, amount: advance, date: today(), note: 'Advance' }]
          : state.ledger
      });
    }
    setAdding(false);
    setEditing(null);
  };

  const remove = (c: Client) => {
    if (!confirm(`Delete ${c.name} AND their orders? Cash already received stays in the books.`)) return;
    const doomed = state.orders.filter(o => o.clientId === c.id);
    doomed.forEach(o => (o.files ?? []).forEach(f => { removeFile(f).catch(() => { /* best effort */ }); }));
    setState({
      ...state,
      clients: state.clients.filter(x => x.id !== c.id),
      orders: state.orders.filter(o => o.clientId !== c.id),
      // keep the cash rows, just tag them so history (and the health check) stays truthful
      ledger: state.ledger.map(l =>
        l.bucket === 'client' && l.refId === c.id ? D.markOrphaned(l) : l
      )
    });
  };

  const receive = () => {
    if (!payFor) return;
    const due = Math.max(0, D.clientDue(state, payFor));
    if (amount <= 0) { alert('Enter how much cash you received.'); return; }
    if (due <= 0) { alert('Nothing outstanding for this client.'); return; }
    let amt = amount;
    if (amount > due) {
      const ok = confirm(
        `${payFor.name} actually owes Rs ${money(due)} but you entered Rs ${money(amount)}.\n\n` +
        `Record only Rs ${money(due)}? Press Cancel to go back and fix the amount.`
      );
      if (!ok) return;
      amt = due;
    }
    setState({
      ...state,
      ledger: [...state.ledger, {
        id: 'led' + Date.now(), kind: 'in', bucket: 'client', refId: payFor.id,
        amount: amt, date: today(), note: note || 'Cash received'
      }]
    });
    setPayFor(null); setAmount(0); setNote('');
  };

  const totalDue = state.clients.reduce((a, c) => a + Math.max(0, D.clientDue(state, c)), 0);
  const totalGot = state.clients.reduce((a, c) => a + D.clientPaid(state, c), 0);

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={IndianRupee} label="Received (active)" value={`₹ ${money(totalGot)}`} accent="text-green-600" />
        <StatCard icon={Wallet} label="Still to collect" value={`₹ ${money(totalDue)}`} accent="text-red-600" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {state.clients.map(c => {
          const rawDue = D.clientDue(state, c);
          const due = Math.max(0, rawDue);
          const ahead = rawDue < 0;
          const total = D.clientTotal(state, c);
          const paid = D.clientPaid(state, c);
          const orders = state.orders.filter(o => o.clientId === c.id).length;
          const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
          return (
            <div key={c.id} className="bg-white rounded-3xl shadow-lg overflow-hidden border-4 border-purple-100">
              <div className="relative">
                <img src={c.photo || 'https://i.pravatar.cc/300?u=' + c.id} className="w-full h-36 object-cover" />
                <div className="absolute top-2 right-2 flex gap-1">
                  <EditBtn onClick={() => openEdit(c)} />
                </div>
                <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-xs font-black uppercase px-2 py-1 truncate">
                  {c.name}
                </div>
              </div>
              <div className="p-3 space-y-2">
                <div className={`text-center font-black ${ahead ? 'text-blue-600' : due > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {due > 0 ? `₹ ${money(due)} due`
                    : ahead ? `₹ ${money(-rawDue)} paid ahead`
                      : <span className="text-green-600 flex items-center justify-center gap-1"><CheckCircle2 size={16} /> Settled</span>}
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 transition-all" style={{ width: pct + '%' }} />
                </div>
                <div className="text-[10px] font-bold text-gray-400 text-center flex justify-center gap-2">
                  <span className="flex items-center gap-1 text-green-600"><IndianRupee size={11} />{money(paid)}</span>
                  <span>/ ₹{money(total)}</span>
                </div>
                <button onClick={() => setOrdersFor(c)}
                  title="Open this client's orders & designs"
                  className="w-full text-[10px] font-black text-gray-500 bg-gray-50 hover:bg-gray-100 py-1.5 rounded-lg active:scale-95 flex items-center justify-center gap-1">
                  <Package size={11} /> {orders} {orders === 1 ? 'order' : 'orders'} — open
                </button>
                <button onClick={() => { setPayFor(c); setAmount(0); setNote(''); }}
                  disabled={rawDue <= 0}
                  className={`w-full py-2.5 rounded-xl font-black uppercase text-xs active:scale-95 flex items-center justify-center gap-1 ${rawDue > 0 ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                  <Wallet size={14} /> Receive
                </button>
                <div className="grid grid-cols-2 gap-1">
                  <WhatsAppBtn phone={c.phone} message={clientMessage(state, c.id)} label="Chat" />
                  <DeleteBtn onClick={() => remove(c)} />
                </div>
              </div>
            </div>
          );
        })}

        <button onClick={openAdd} className="min-h-[260px] rounded-3xl border-4 border-dashed border-purple-300 flex flex-col items-center justify-center gap-2 text-purple-400 active:scale-95">
          <Camera size={44} />
          <span className="font-black uppercase text-xs">New Client Photo</span>
        </button>
      </div>

      {/* Add / Edit */}
      <Modal open={adding} onClose={() => setAdding(false)} title={editing ? 'Edit client' : 'New client'}>
        <div className="flex justify-center my-3">
          <PhotoInput value={draft.photo} onChange={(v: string) => setDraft({ ...draft, photo: v })} />
        </div>
        <Field label="Name"><input className={inputCls} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Can leave blank" /></Field>
        <Field label="WhatsApp number">
          <div className="relative">
            <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className={inputCls + ' pl-10'} value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} placeholder="03001234567" />
          </div>
        </Field>
        <Field label="Notes"><textarea className={inputCls} rows={2} value={draft.notes || ''} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></Field>
        {!editing && <MoneyField label="Advance received now" value={draft.advancePaid || 0} onChange={(v: number) => setDraft({ ...draft, advancePaid: v })} />}
        <MoneyField label="Estimated order value" value={draft.totalOrderValue || 0} onChange={(v: number) => setDraft({ ...draft, totalOrderValue: v })} />
        <div className="text-[10px] text-gray-400 font-bold">Used only until this client gets their first priced order</div>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <button onClick={() => { setAdding(false); setEditing(null); }} className="py-4 rounded-2xl bg-gray-100 font-black uppercase active:scale-95">Cancel</button>
          <button onClick={save} className="py-4 rounded-2xl bg-purple-600 text-white font-black uppercase active:scale-95">Save</button>
        </div>
      </Modal>

      {/* Receive money */}
      <Modal open={!!payFor} onClose={() => setPayFor(null)} title={`Receive from ${payFor?.name || ''}`}>
        <div className="text-center my-4 space-y-3">
          <img src={payFor?.photo || 'https://i.pravatar.cc/300?u=' + (payFor?.id || '')} className="w-24 h-24 rounded-full mx-auto object-cover border-4 border-green-200" />
          <div className="text-sm font-bold text-gray-500">
            Outstanding:{' '}
            <span className="font-black text-red-600">
              ₹ {money(Math.max(0, payFor ? D.clientDue(state, payFor) : 0))}
            </span>
            {payFor && D.clientDue(state, payFor) < 0 && (
              <span className="block text-blue-600">already ₹{money(-D.clientDue(state, payFor))} paid ahead</span>
            )}
          </div>
          <div className="relative">
            <IndianRupee size={26} className="absolute left-4 top-1/2 -translate-y-1/2 text-green-600" />
            <input className={inputCls + ' pl-10 text-center text-3xl text-green-700'} type="number" value={amount} onChange={e => setAmount(+e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[1000, 5000, 10000].map(v => (
              <button key={v} onClick={() => setAmount(a => a + v)} className="py-3 bg-green-100 text-green-800 rounded-xl font-black active:scale-95">+{money(v)}</button>
            ))}
          </div>
          <Field label="Note (optional)">
            <input className={inputCls} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. installment 2" />
          </Field>
        </div>
        <button onClick={receive}
          className="w-full py-4 bg-green-600 text-white rounded-2xl font-black uppercase active:scale-95 flex items-center justify-center gap-2">
          <Wallet size={20} /> Confirm Cash Received
        </button>
        <div className="text-[10px] text-gray-400 font-bold text-center mt-2">Every rupee you enter lands in Payments automatically.</div>
      </Modal>

      {/* Client's orders & uploaded designs — what the client sends shows up here */}
      <Modal open={!!ordersFor} onClose={() => setOrdersFor(null)} title={ordersFor ? `${ordersFor.name} — orders` : 'Orders'}>
        {ordersFor && (
          <div className="space-y-3">
            {state.orders.filter(o => o.clientId === ordersFor.id).length === 0 && (
              <div className="text-center text-gray-300 font-bold py-6 text-xs">No orders for this client yet</div>
            )}
            {state.orders.filter(o => o.clientId === ordersFor.id).map(o => {
              const hl = orderHeadline(o);
              return (
                <div key={o.id} className="border-2 border-gray-100 rounded-2xl p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black uppercase text-sm">{hl.qty}× {hl.kind}</span>
                    <span className={`text-[10px] font-black px-2 py-1 rounded uppercase ${stageChip[o.status]}`}>{o.status}</span>
                    {o.price > 0 && <span className="text-[10px] font-black text-green-600">₹{money(o.price)}</span>}
                    {o.woodType && <span className="text-[10px] font-black bg-wood/10 text-wood px-2 py-1 rounded">{o.woodType}</span>}
                  </div>
                  <SpecSummary specs={o.specs} />
                  {o.notes && <div className="text-xs font-bold text-gray-500 mt-2 bg-gray-50 p-2 rounded-xl">{o.notes}</div>}
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
