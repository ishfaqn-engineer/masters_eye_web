import React, { useState } from 'react';
import { Package, Clock, Wallet, TreePine, Plus, Send, ImagePlus, CheckCircle2 } from 'lucide-react';
import { AppState, Account, OrderItem, OrderStatus, OrderSpecs, seedSpecs, specsToFlat, specWoodTotal, orderHeadline } from '../store';
import * as D from '../lib/derive';
import { money, Modal, Field, inputCls, StatCard, DesignPicker } from '../components/ui';
import { SpecEditor, SpecSummary } from '../components/SpecEditor';

type Props = { state: AppState; setState: (s: AppState) => void; account: Account };

const STAGES: OrderStatus[] = ['pending', 'cutting', 'polish', 'installed', 'delivered'];
const stageChip: Record<OrderStatus, string> = {
  pending: 'bg-gray-100 text-gray-500',
  cutting: 'bg-orange-100 text-orange-600',
  polish: 'bg-blue-100 text-blue-600',
  installed: 'bg-purple-100 text-purple-600',
  delivered: 'bg-green-100 text-green-600',
};

/* Client's home — their profile, their orders, and design uploads that land in
   the master's client section as a new order (same shared state, so on this
   device it is instant; Drive sync carries it to other devices) */
export default function ClientHome({ state, setState, account }: Props) {
  const client = state.clients.find(c => c.id === account.clientId);
  const [reqOpen, setReqOpen] = useState(false);
  const [req, setReq] = useState<{ specs: OrderSpecs; notes: string } | null>(null);
  const [addFor, setAddFor] = useState<OrderItem | null>(null);
  const [addImgs, setAddImgs] = useState<string[]>([]);

  if (!client) {
    return (
      <div className="p-4 space-y-4">
        <div className="bg-white rounded-3xl shadow p-6 text-center">
          <div className="font-black uppercase text-sm text-gray-400">No client linked</div>
          <div className="text-xs font-bold text-gray-400 mt-2">
            Ask the master to link this login to your client record (Settings → Logins &amp; roles).
          </div>
        </div>
      </div>
    );
  }

  const orders = state.orders.filter(o => o.clientId === client.id);
  const active = orders.filter(o => o.status !== 'delivered').length;
  const due = Math.max(0, D.clientDue(state, client));
  const woodKnown = orders.some(o => o.specs && (o.specs.doors.length || o.specs.windows.length || o.specs.others.length));
  const wood = orders.reduce((a, o) => a + specWoodTotal(o.specs), 0);

  const openRequest = () => {
    setReq({ specs: seedSpecs({ kind: 'door', qty: 1, widthIn: 36, heightIn: 84 }), notes: '' });
    setReqOpen(true);
  };

  const submitRequest = () => {
    if (!req) return;
    const specs = req.specs;
    const hasLines = specs.doors.length + specs.windows.length + specs.others.length > 0;
    if (!hasLines && !specs.designs.filter(Boolean).length) {
      alert('Add at least one door, window or other item — or upload a design first.');
      return;
    }
    const flat = hasLines ? specsToFlat(specs) : { kind: 'other' as const, qty: 1, widthIn: 36, heightIn: 84 };
    const order: OrderItem = {
      id: 'o' + Date.now(), clientId: client.id, ...flat,
      woodType: '', price: 0, status: 'pending',
      notes: (req.notes.trim() ? req.notes.trim() + ' · ' : '') + 'Design request sent by client',
      files: [], specs
    };
    setState({ ...state, orders: [...state.orders, order] });
    setReqOpen(false);
    setReq(null);
  };

  const saveDesigns = () => {
    if (!addFor) return;
    const imgs = addImgs.filter(Boolean);
    if (!imgs.length) { alert('Pick at least one design photo.'); return; }
    setState({
      ...state,
      orders: state.orders.map(o => {
        if (o.id !== addFor.id) return o;
        const sp = o.specs ?? seedSpecs(o);
        return { ...o, specs: { ...sp, designs: [...sp.designs, ...imgs] } };
      })
    });
    setAddFor(null);
    setAddImgs([]);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="bg-gradient-to-br from-wood-dark to-wood text-white rounded-3xl p-5 shadow-lg flex items-center gap-4">
        <img src={client.photo || `https://i.pravatar.cc/300?u=${client.id}`} className="w-16 h-16 rounded-full object-cover" alt="" />
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-widest opacity-70">Welcome back</div>
          <div className="text-2xl font-black uppercase truncate">{client.name}</div>
          <div className="text-xs font-bold opacity-70">{client.phone || '—'}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Package} label="My orders" value={orders.length} sub={`${active} in progress`} accent="text-orange-600" />
        <StatCard icon={Wallet} label="To pay" value={`₹ ${money(due)}`} accent={due > 0 ? 'text-red-600' : 'text-green-600'} />
        <StatCard icon={TreePine} label="Wood required" value={woodKnown ? `${wood} cft` : '—'} accent="text-wood" />
        <StatCard icon={Clock} label="Latest status" value={orders.length ? orders[orders.length - 1].status : '—'} accent="text-blue-600" />
      </div>

      <button onClick={openRequest}
        className="w-full py-4 border-4 border-dashed border-orange-300 rounded-2xl text-orange-500 font-black uppercase active:scale-95 flex items-center justify-center gap-2">
        <Plus /> New design request
      </button>

      <div className="space-y-3">
        <div className="font-black uppercase text-xs text-gray-400 px-1">My orders</div>
        {orders.length === 0 && (
          <div className="bg-white rounded-3xl shadow p-6 text-center text-xs font-bold text-gray-400">
            No orders yet — send your first design request above.
          </div>
        )}
        {orders.map(o => {
          const hl = orderHeadline(o);
          return (
            <div key={o.id} className="bg-white rounded-3xl shadow p-4 border-l-8 border-orange-500">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black uppercase">{hl.qty}× {hl.kind}</span>
                <span className={`text-[10px] font-black px-2 py-1 rounded uppercase ${stageChip[o.status]}`}>{o.status}</span>
                {o.price > 0 && <span className="text-[10px] font-black text-green-600">₹{money(o.price)}</span>}
                {o.woodType && <span className="text-[10px] font-black bg-wood/10 text-wood px-2 py-1 rounded">{o.woodType}</span>}
              </div>
              <SpecSummary specs={o.specs} />
              {o.notes && <div className="text-xs font-bold text-gray-500 mt-2 bg-gray-50 p-2 rounded-xl">{o.notes}</div>}
              <div className="flex gap-1 mt-3">
                {STAGES.map((s, i) => {
                  const idx = STAGES.indexOf(o.status);
                  return (
                    <div key={s} className={`flex-1 h-3 rounded-full ${i <= idx ? 'bg-green-500' : 'bg-gray-200'}`} />
                  );
                })}
              </div>
              <div className="flex justify-between mt-1 text-[9px] font-black uppercase text-gray-400">
                {STAGES.map(s => <span key={s} className={o.status === s ? 'text-green-600' : ''}>{s}</span>)}
              </div>
              <button onClick={() => { setAddFor(o); setAddImgs([]); }}
                className="mt-3 w-full py-2.5 rounded-xl bg-orange-50 text-orange-600 font-black uppercase text-xs active:scale-95 flex items-center justify-center gap-1.5">
                <ImagePlus size={15} /> Add design / photo
              </button>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-3xl shadow p-4">
        <div className="font-black uppercase text-sm mb-1">My profile</div>
        <div className="text-xs font-bold text-gray-400">
          Your photos, phone and orders are managed by the master. Uploads you send here appear in the master's
          Clients section as an order. On another device, the master sees them after a Drive sync
          (Settings → Backup to Drive, then the master presses Restore).
        </div>
      </div>

      {/* new design request */}
      <Modal open={reqOpen} onClose={() => setReqOpen(false)} title="New design request">
        {req && (
          <>
            <SpecEditor specs={req.specs} onChange={s => setReq({ ...req, specs: s })} />
            <Field label="Notes for the master (optional)">
              <textarea className={inputCls} rows={2} value={req.notes} onChange={e => setReq({ ...req, notes: e.target.value })}
                placeholder="e.g. same carving as the last order" />
            </Field>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <button onClick={() => setReqOpen(false)} className="py-4 rounded-2xl bg-gray-100 font-black uppercase active:scale-95">Cancel</button>
              <button onClick={submitRequest} className="py-4 rounded-2xl bg-orange-600 text-white font-black uppercase active:scale-95 flex items-center justify-center gap-2">
                <Send size={18} /> Send
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* add design to an existing order */}
      <Modal open={!!addFor} onClose={() => setAddFor(null)} title="Add design">
        <div className="text-xs font-bold text-gray-500 mb-3">
          These photos attach to <b>{addFor ? `${addFor.qty}× ${addFor.kind}` : ''}</b> and show up in the master's order right away.
        </div>
        <DesignPicker values={addImgs} onChange={setAddImgs} label="Pick design photo" />
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button onClick={() => setAddFor(null)} className="py-4 rounded-2xl bg-gray-100 font-black uppercase active:scale-95">Cancel</button>
          <button onClick={saveDesigns} className="py-4 rounded-2xl bg-orange-600 text-white font-black uppercase active:scale-95 flex items-center justify-center gap-2">
            <CheckCircle2 size={18} /> Send
          </button>
        </div>
      </Modal>
    </div>
  );
}
