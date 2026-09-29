import React, { useState } from 'react';
import { Plus, DoorOpen, PanelsTopLeft, FileSpreadsheet, Wallet, Ruler } from 'lucide-react';
import { AppState, OrderItem, OrderStatus } from '../store';
import { money, Modal, Field, inputCls, MoneyField, ExportRow, EditBtn, DeleteBtn, FileDrop, AttachmentList, StatCard } from '../components/ui';
import { exportOrdersExcel, exportOrdersPdf } from '../lib/exporters';
import { clientMessage, openWhatsApp } from '../lib/whatsapp';
import { removeFile } from '../lib/files';
import * as D from '../lib/derive';

type Props = { state: AppState; setState: (s: AppState) => void };

const STAGES: OrderStatus[] = ['pending', 'cutting', 'polish', 'installed', 'delivered'];
const KINDS = ['door', 'window', 'other'] as const;
const WOODS = ['Teak', 'Sheesham', 'Oak', 'Pine', 'Walnut'];

const blank = (clientId: string) => ({
  clientId, kind: 'door' as const, qty: 1, widthIn: 36, heightIn: 84,
  woodType: 'Teak', price: 0, status: 'pending' as OrderStatus, notes: '', files: [] as string[]
});

export default function OrdersPage({ state, setState }: Props) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<OrderItem | null>(null);
  const [draft, setDraft] = useState<any>(blank(state.clients[0]?.id || ''));
  // synchronously-mutated flag: a slow upload that lands after close is dropped
  const formOpen = React.useRef(false);

  const openAdd = () => { formOpen.current = true; setDraft(blank(state.clients[0]?.id || '')); setEditing(null); setAdding(true); };
  const openEdit = (o: OrderItem) => { formOpen.current = true; setDraft({ ...o, files: [...(o.files ?? [])].filter(Boolean) }); setEditing(o); setAdding(true); };

  const save = () => {
    if (!draft.clientId) { alert('Add a client first'); return; }
    const clean = {
      ...draft,
      qty: Math.max(1, Number(draft.qty) || 1),
      widthIn: Math.max(1, Number(draft.widthIn) || 1),
      heightIn: Math.max(1, Number(draft.heightIn) || 1),
      price: Math.max(0, Number(draft.price) || 0),
      files: (draft.files || []).filter((f: string) => !!f)
    };
    const gone = editing ? (editing.files ?? []).filter(f => !clean.files.includes(f)) : [];
    if (editing) {
      setState({ ...state, orders: state.orders.map(o => o.id === editing.id ? { ...o, ...clean } : o) });
    } else {
      setState({ ...state, orders: [...state.orders, { id: 'o' + Date.now(), ...clean } as OrderItem] });
    }
    // delete only after the order itself has been updated
    gone.forEach(f => { removeFile(f).catch(() => { /* best effort */ }); });
    formOpen.current = false;
    setAdding(false); setEditing(null);
  };

  /* closing the form without saving must not leave blobs behind */
  const cancel = () => {
    formOpen.current = false;
    const originals = editing ? (editing.files ?? []) : [];
    (draft.files || []).filter((f: string) => !originals.includes(f))
      .forEach((f: string) => { removeFile(f).catch(() => { /* best effort */ }); });
    setAdding(false); setEditing(null);
  };

  const setStatus = (id: string, status: OrderStatus) =>
    setState({ ...state, orders: state.orders.map(o => o.id === id ? { ...o, status } : o) });

  const remove = (o: OrderItem) => {
    const c = state.clients.find(x => x.id === o.clientId);
    let msg = 'Delete this order?';
    if (c) {
      const afterState = { ...state, orders: state.orders.filter(x => x.id !== o.id) };
      const before = D.clientTotal(state, c);
      const after = D.clientTotal(afterState, c);
      const dueAfter = D.clientDue(afterState, c);
      msg = `Deleting drops ${c.name}'s total from Rs ${money(before)} to Rs ${money(after)}; they will show ` +
        (dueAfter >= 0 ? `Rs ${money(dueAfter)} due.` : `Rs ${money(-dueAfter)} paid ahead.`);
    }
    if (!confirm(msg)) return;
    (o.files ?? []).forEach(f => { removeFile(f).catch(() => { /* orphan cleanup is best-effort */ }); });
    setState({ ...state, orders: state.orders.filter(x => x.id !== o.id) });
  };

  /* an upload that finishes after the form closed gets deleted, not orphaned */
  const addFile = (fid: string) => {
    if (!formOpen.current) { removeFile(fid).catch(() => { /* best effort */ }); return; }
    setDraft((d: any) => ({ ...d, files: [...(d.files || []), fid] }));
  };
  const dropFile = (fid: string) => {
    setDraft((d: any) => ({ ...d, files: (d.files || []).filter((x: string) => x !== fid) }));
    removeFile(fid).catch(() => { /* best effort */ });
  };

  const total = state.orders.reduce((a, o) => a + o.price, 0);
  const clientOf = (id: string) => state.clients.find(c => c.id === id);

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={DoorOpen} label="Total orders" value={state.orders.length} />
        <StatCard icon={Wallet} label="Order value" value={`₹ ${money(total)}`} accent="text-green-600" />
      </div>

      <ExportRow onExcel={() => exportOrdersExcel(state)} onPdf={() => exportOrdersPdf(state)} />

      <div className="space-y-3">
        {state.orders.map(o => {
          const c = clientOf(o.clientId);
          const Icon = o.kind === 'door' ? DoorOpen : o.kind === 'window' ? PanelsTopLeft : Ruler;
          const stageIdx = STAGES.indexOf(o.status);
          return (
            <div key={o.id} className="bg-white rounded-3xl shadow p-4 border-l-8 border-orange-500">
              <div className="flex items-start gap-3">
                <div className="bg-orange-100 p-3 rounded-xl"><Icon size={26} className="text-orange-600" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black uppercase">{o.qty}× {o.kind}</span>
                    <span className="text-[10px] font-black bg-gray-100 px-2 py-1 rounded">{o.widthIn}"×{o.heightIn}"</span>
                    <span className="text-[10px] font-black bg-wood/10 text-wood px-2 py-1 rounded">{o.woodType}</span>
                  </div>
                  <div className="text-xs font-bold text-gray-400 mt-0.5 flex items-center gap-1">
                    {c?.photo && <img src={c.photo} className="w-4 h-4 rounded-full object-cover" />}
                    {c?.name || '—'}
                    <span className="text-green-600 font-black">· ₹{money(o.price)}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <EditBtn onClick={() => openEdit(o)} />
                  <DeleteBtn onClick={() => remove(o)} />
                </div>
              </div>

              {o.notes && <div className="text-xs font-bold text-gray-500 mt-2 bg-gray-50 p-2 rounded-xl">{o.notes}</div>}

              {/* designs / photos */}
              <AttachmentList ids={(o.files ?? []).filter(Boolean)} />

              {/* stage slider */}
              <div className="mt-3">
                <div className="flex gap-1">
                  {STAGES.map((s, i) => (
                    <button key={s} onClick={() => setStatus(o.id, s)}
                      className={`flex-1 h-3 rounded-full transition ${i <= stageIdx ? 'bg-green-500' : 'bg-gray-200'} active:scale-95`} />
                  ))}
                </div>
                <div className="flex justify-between mt-1 text-[9px] font-black uppercase text-gray-400">
                  {STAGES.map(s => <span key={s} className={o.status === s ? 'text-green-600' : ''}>{s}</span>)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3">
                <button onClick={() => exportOrdersExcel(state)}
                  className="py-2 rounded-xl bg-green-700 text-white text-[11px] font-black uppercase active:scale-95 flex items-center justify-center gap-1">
                  <FileSpreadsheet size={14} /> Excel
                </button>
                <button
                  disabled={!c || !c.phone}
                  onClick={() => c && openWhatsApp(c.phone, clientMessage(state, c.id))}
                  className={`py-2 rounded-xl text-[11px] font-black uppercase active:scale-95 flex items-center justify-center gap-1
                    ${c?.phone ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-300'}`}>
                  Send to client
                </button>
              </div>
            </div>
          );
        })}

        <button onClick={openAdd}
          className="w-full py-4 border-4 border-dashed border-orange-300 rounded-2xl text-orange-500 font-black uppercase active:scale-95 flex items-center justify-center gap-2">
          <Plus /> New Order
        </button>
      </div>

      <Modal open={adding} onClose={cancel} title={editing ? 'Edit order' : 'New order'}>
        <Field label="Client">
          <select className={inputCls} value={draft.clientId} onChange={e => setDraft({ ...draft, clientId: e.target.value })}>
            {state.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <div className="grid grid-cols-3 gap-2">
            {KINDS.map(k => (
              <button key={k} onClick={() => setDraft({ ...draft, kind: k })}
                className={`py-3 rounded-xl font-black uppercase text-sm ${draft.kind === k ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{k}</button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Qty"><input className={inputCls} type="number" value={draft.qty} onChange={e => setDraft({ ...draft, qty: e.target.value === '' ? '' : +e.target.value })} /></Field>
          <Field label='Width"'><input className={inputCls} type="number" value={draft.widthIn} onChange={e => setDraft({ ...draft, widthIn: e.target.value === '' ? '' : +e.target.value })} /></Field>
          <Field label='Height"'><input className={inputCls} type="number" value={draft.heightIn} onChange={e => setDraft({ ...draft, heightIn: e.target.value === '' ? '' : +e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Wood">
            <select className={inputCls} value={draft.woodType} onChange={e => setDraft({ ...draft, woodType: e.target.value })}>
              {WOODS.map(t => <option key={t} value={t}>{t}</option>)}
              {draft.woodType && !WOODS.includes(draft.woodType) && <option value={draft.woodType}>{draft.woodType}</option>}
            </select>
          </Field>
          <Field label="Status">
            <select className={inputCls} value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}>
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <MoneyField label="Price of this order" value={draft.price} onChange={(v: number) => setDraft({ ...draft, price: v })} />
        <Field label="Notes (designer instructions, client demands)">
          <textarea className={inputCls} rows={2} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} />
        </Field>
        <Field label="Designs / photos (visible to your whole team)">
          <FileDrop onAdd={addFile} label="Upload design photo or PDF" />
        </Field>
        <AttachmentList ids={(draft.files || []).filter(Boolean)} onRemove={dropFile} />

        <div className="grid grid-cols-2 gap-3 mt-3">
          <button onClick={cancel} className="py-4 rounded-2xl bg-gray-100 font-black uppercase active:scale-95">Cancel</button>
          <button onClick={save} className="py-4 rounded-2xl bg-orange-600 text-white font-black uppercase active:scale-95">Save</button>
        </div>
      </Modal>
    </div>
  );
}
