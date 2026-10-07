import React, { useState } from 'react';
import { Plus, DoorOpen, PanelsTopLeft, FileSpreadsheet, Wallet, Ruler, FileText, X, Search, SlidersHorizontal } from 'lucide-react';
import { AppState, OrderItem, OrderStatus, OrderSpecs, Quote, QuoteItem, quoteTotal, seedSpecs, specsToFlat, orderHeadline, today } from '../store';
import { money, Modal, Field, inputCls, MoneyField, ExportRow, EditBtn, DeleteBtn, FileDrop, AttachmentList, StatCard, WhatsAppBtn } from '../components/ui';
import { SpecEditor, SpecSummary } from '../components/SpecEditor';
import { exportOrdersExcel, exportOrdersPdf } from '../lib/exporters';
import { clientMessage, openWhatsApp, quoteMessage } from '../lib/whatsapp';
import { removeFile } from '../lib/files';
import * as D from '../lib/derive';

type Props = { state: AppState; setState: (s: AppState) => void };

const STAGES: OrderStatus[] = ['pending', 'cutting', 'polish', 'installed', 'delivered'];
const WOODS = ['Teak', 'Sheesham', 'Oak', 'Pine', 'Walnut'];

const blankSpecs = () => seedSpecs({ kind: 'door', qty: 1, widthIn: 36, heightIn: 84 });
const blank = (clientId: string) => ({
  clientId, kind: 'door' as const, qty: 1, widthIn: 36, heightIn: 84,
  woodType: 'Teak', price: 0, status: 'pending' as OrderStatus, notes: '', files: [] as string[],
  specs: blankSpecs() as OrderSpecs
});
const blankQuote = (clientId: string) => ({
  clientId,
  items: [{ id: 'qi' + Date.now(), desc: '', qty: 1, rate: 0 } as QuoteItem],
  discount: 0, note: '', validDays: 7
});

export default function OrdersPage({ state, setState }: Props) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<OrderItem | null>(null);
  const [draft, setDraft] = useState<any>(blank(state.clients[0]?.id || ''));
  const [qAdding, setQAdding] = useState(false);
  const [qDraft, setQDraft] = useState<any>(blankQuote(state.clients[0]?.id || ''));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  // synchronously-mutated flag: a slow upload that lands after close is dropped
  const formOpen = React.useRef(false);

  const openAdd = () => { formOpen.current = true; setDraft(blank(state.clients[0]?.id || '')); setEditing(null); setAdding(true); };
  const openEdit = (o: OrderItem) => {
    formOpen.current = true;
    setDraft({ ...o, files: [...(o.files ?? [])].filter(Boolean), specs: o.specs ?? seedSpecs(o) });
    setEditing(o); setAdding(true);
  };

  const save = () => {
    if (!draft.clientId) { alert('Add a client first'); return; }
    const specs: OrderSpecs = draft.specs ?? blankSpecs();
    // the spec sheet is the source of truth now — the flat fields feed exports
    const hasLines = specs.doors.length + specs.windows.length + specs.others.length > 0;
    const flat = hasLines ? specsToFlat(specs) : {
      kind: draft.kind, qty: Math.max(1, Number(draft.qty) || 1),
      widthIn: Math.max(1, Number(draft.widthIn) || 1), heightIn: Math.max(1, Number(draft.heightIn) || 1)
    };
    const clean = {
      ...draft,
      ...flat,
      specs,
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

  /* ---- quotes: price first, one tap → real order ---- */

  const openQuote = () => { setQDraft(blankQuote(state.clients[0]?.id || '')); setQAdding(true); };

  const saveQuote = () => {
    if (!qDraft.clientId) { alert('Add a client first'); return; }
    const items: QuoteItem[] = (qDraft.items || [])
      .map((i: any) => ({
        id: typeof i.id === 'string' ? i.id : 'qi' + Date.now(),
        desc: String(i.desc || '').trim(),
        qty: Math.max(0, Number(i.qty) || 0),
        rate: Math.max(0, Number(i.rate) || 0),
      }))
      .filter((i: QuoteItem) => i.desc);
    if (!items.length) { alert('Give at least one item a description.'); return; }
    const q: Quote = {
      id: 'q' + Date.now(), clientId: qDraft.clientId, date: today(), items,
      discount: Math.max(0, Number(qDraft.discount) || 0),
      note: String(qDraft.note || '').trim(),
      validDays: Math.max(1, Number(qDraft.validDays) || 7),
      status: 'draft',
    };
    setState({ ...state, quotes: [q, ...state.quotes] });
    setQAdding(false);
  };

  const markSent = (id: string) =>
    setState({ ...state, quotes: state.quotes.map(q => q.id === id ? { ...q, status: 'sent' as const } : q) });
  const declineQuote = (id: string) =>
    setState({ ...state, quotes: state.quotes.map(q => q.id === id ? { ...q, status: 'declined' as const } : q) });

  /* the quote items become the order's spec sheet — dims get filled by editing
     the order later, so the card shows the items without fake measurements */
  const acceptQuote = (q: Quote) => {
    if (q.status === 'accepted') return;
    const specs: OrderSpecs = {
      doors: [],
      windows: [],
      others: q.items.map(i => ({
        id: 'sl' + i.id, label: i.desc, qty: Math.max(1, i.qty || 1),
        widthIn: 0, heightIn: 0, woodCft: 0,
      })),
      designs: [],
    };
    const flat = specsToFlat(specs);
    const order = {
      id: 'o' + Date.now(), clientId: q.clientId, ...flat, woodType: '',
      price: quoteTotal(q), status: 'pending' as OrderStatus, notes: q.note,
      files: [] as string[], specs,
    } as OrderItem;
    setState({
      ...state,
      orders: [...state.orders, order],
      quotes: state.quotes.map(x => x.id === q.id ? { ...x, status: 'accepted' as const, orderId: order.id } : x),
    });
  };

  const discardQuote = (q: Quote) => {
    if (!confirm(q.orderId
      ? 'Remove this quote card? The order created from it stays.'
      : 'Discard this quote?')) return;
    setState({ ...state, quotes: state.quotes.filter(x => x.id !== q.id) });
  };

  const total = state.orders.reduce((a, o) => a + o.price, 0);
  const filteredOrders = state.orders.filter(o => {
    const c = clientOf(o.clientId);
    const q = search.trim().toLowerCase();
    const matchesText = !q || (c?.name || '').toLowerCase().includes(q) || (o.notes || '').toLowerCase().includes(q) || (o.woodType || '').toLowerCase().includes(q);
    return matchesText && (statusFilter === 'all' || o.status === statusFilter);
  });
  const clientOf = (id: string) => state.clients.find(c => c.id === id);
  const qDraftTotal = Math.max(0,
    (qDraft.items || []).reduce((a: number, i: any) => a + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0)
    - (Number(qDraft.discount) || 0));

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={DoorOpen} label="Total orders" value={state.orders.length} />
        <StatCard icon={Wallet} label="Order value" value={`₹ ${money(total)}`} accent="text-green-600" />
      </div>

      <ExportRow onExcel={() => exportOrdersExcel(state)} onPdf={() => exportOrdersPdf(state)} />

      <div className="bg-white rounded-2xl shadow p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Search size={18} className="text-gray-400" />
          <input className="flex-1 outline-none font-bold text-sm" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search client, wood or notes" />
          {search && <button onClick={() => setSearch('')} className="text-xs font-black text-gray-400">CLEAR</button>}
        </div>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          <SlidersHorizontal size={15} className="text-gray-400 shrink-0 mr-1" />
          {(['all', ...STAGES] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase whitespace-nowrap ${statusFilter === s ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* estimates: quote a price → WhatsApp → accept turns it into a real order */}
      <div className="bg-white rounded-3xl shadow p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-black uppercase text-sm">Quotes / estimates</div>
          <div className="text-[11px] font-bold text-gray-400">{state.quotes.length} total</div>
        </div>
        {state.quotes.length === 0 && (
          <div className="text-xs font-bold text-gray-400 bg-gray-50 rounded-xl p-3">
            No quotes yet — send a price before the work starts, then one tap turns it into an order.
          </div>
        )}
        <div className="space-y-3">
          {state.quotes.map(q => {
            const c = clientOf(q.clientId);
            const st = q.status;
            const chip = st === 'accepted' ? 'bg-green-100 text-green-700'
              : st === 'sent' ? 'bg-blue-100 text-blue-700'
              : st === 'declined' ? 'bg-gray-200 text-gray-500'
              : 'bg-purple-100 text-purple-700';
            const open = st !== 'accepted' && st !== 'declined';
            return (
              <div key={q.id} className="bg-white border-2 border-gray-100 rounded-2xl p-3">
                <div className="flex items-start gap-3">
                  <div className="bg-purple-100 p-2.5 rounded-xl"><FileText size={22} className="text-purple-600" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black uppercase text-sm">{c?.name || '—'}</span>
                      <span className={`text-[10px] font-black px-2 py-1 rounded uppercase ${chip}`}>
                        {st === 'accepted' ? 'order made' : st}
                      </span>
                    </div>
                    <div className="text-[11px] font-bold text-gray-400">{q.date} · valid {q.validDays} days</div>
                  </div>
                  <div className="text-lg font-black text-purple-700 whitespace-nowrap tabular-nums">Rs {money(quoteTotal(q))}</div>
                </div>
                <div className="mt-2 space-y-0.5 text-[11px] font-bold text-gray-600">
                  {q.items.map(i => (
                    <div key={i.id} className="flex justify-between gap-3">
                      <span className="truncate">{i.desc}</span>
                      <span className="tabular-nums whitespace-nowrap">× {i.qty} · Rs {money((Number(i.qty) || 0) * (Number(i.rate) || 0))}</span>
                    </div>
                  ))}
                  {q.discount > 0 && (
                    <div className="flex justify-between gap-3 text-red-500"><span>Discount</span><span>− Rs {money(q.discount)}</span></div>
                  )}
                  {q.note && <div className="text-gray-400 italic pt-0.5">{q.note}</div>}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {open && (
                    <WhatsAppBtn compact phone={c?.phone} message={quoteMessage(state, q)} label="Send quote" onOpen={() => markSent(q.id)} />
                  )}
                  {open && (
                    <button onClick={() => acceptQuote(q)}
                      className="py-1.5 px-3 rounded-xl bg-purple-600 text-white text-[11px] font-black uppercase active:scale-95">
                      Accept &amp; make order
                    </button>
                  )}
                  {open && (
                    <button onClick={() => declineQuote(q.id)}
                      className="py-1.5 px-3 rounded-xl bg-gray-100 text-gray-500 text-[11px] font-black uppercase active:scale-95">
                      Decline
                    </button>
                  )}
                  <button onClick={() => discardQuote(q)}
                    className={`py-1.5 px-3 rounded-xl bg-red-50 text-red-500 text-[11px] font-black uppercase active:scale-95 ${open ? '' : 'col-span-2'}`}>
                    Discard
                  </button>
                </div>
              </div>
            );
          })}
          <button onClick={openQuote}
            className="w-full py-3 border-4 border-dashed border-purple-300 rounded-2xl text-purple-500 font-black uppercase active:scale-95 flex items-center justify-center gap-2">
            <Plus size={18} /> New Quote
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {filteredOrders.map(o => {
          const c = clientOf(o.clientId);
          const Icon = o.kind === 'door' ? DoorOpen : o.kind === 'window' ? PanelsTopLeft : Ruler;
          const stageIdx = STAGES.indexOf(o.status);
          const hl = orderHeadline(o);
          return (
            <div key={o.id} className="bg-white rounded-3xl shadow p-4 border-l-8 border-orange-500">
              <div className="flex items-start gap-3">
                <div className="bg-orange-100 p-3 rounded-xl"><Icon size={26} className="text-orange-600" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black uppercase">{hl.qty}× {hl.kind}</span>
                    <span className="text-[10px] font-black bg-gray-100 px-2 py-1 rounded">{hl.sizes}</span>
                    {o.woodType && <span className="text-[10px] font-black bg-wood/10 text-wood px-2 py-1 rounded">{o.woodType}</span>}
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

              {/* structured doors / windows / others + uploaded designs */}
              <SpecSummary specs={o.specs} />

              {/* designs / photos (IndexedDB attachments: PDFs & extras) */}
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

        {filteredOrders.length === 0 && state.orders.length > 0 && (
          <div className="text-center text-gray-300 font-bold py-5">No orders match this filter</div>
        )}
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
        <SpecEditor specs={draft.specs || blankSpecs()} onChange={(s: OrderSpecs) => setDraft((d: any) => ({ ...d, specs: s }))} />
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label="Wood">
            <select className={inputCls} value={draft.woodType} onChange={e => setDraft({ ...draft, woodType: e.target.value })}>
              {!draft.woodType && <option value="">— pick wood —</option>}
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
        <Field label="Extra files (PDF plans, receipts — stored on this device)">
          <FileDrop onAdd={addFile} label="Upload PDF or photo file" />
        </Field>
        <AttachmentList ids={(draft.files || []).filter(Boolean)} onRemove={dropFile} />

        <div className="grid grid-cols-2 gap-3 mt-3">
          <button onClick={cancel} className="py-4 rounded-2xl bg-gray-100 font-black uppercase active:scale-95">Cancel</button>
          <button onClick={save} className="py-4 rounded-2xl bg-orange-600 text-white font-black uppercase active:scale-95">Save</button>
        </div>
      </Modal>

      <Modal open={qAdding} onClose={() => setQAdding(false)} title="New quote">
        <Field label="Client">
          <select className={inputCls} value={qDraft.clientId} onChange={e => setQDraft({ ...qDraft, clientId: e.target.value })}>
            {state.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <div className="space-y-2 mt-1">
          {qDraft.items.map((it: QuoteItem, i: number) => (
            <div key={it.id} className="flex items-center gap-1.5">
              <input className={inputCls + ' flex-1 !p-2 !text-sm'} placeholder="Item" value={it.desc}
                onChange={e => setQDraft((d: any) => ({ ...d, items: d.items.map((x: any, k: number) => k === i ? { ...x, desc: e.target.value } : x) }))} />
              <input className={inputCls + ' w-14 !p-2 !text-sm text-center'} placeholder="Qty" inputMode="numeric" value={it.qty}
                onChange={e => setQDraft((d: any) => ({ ...d, items: d.items.map((x: any, k: number) => k === i ? { ...x, qty: e.target.value } : x) }))} />
              <input className={inputCls + ' w-24 !p-2 !text-sm text-right'} placeholder="Rate" inputMode="numeric" value={it.rate}
                onChange={e => setQDraft((d: any) => ({ ...d, items: d.items.map((x: any, k: number) => k === i ? { ...x, rate: e.target.value } : x) }))} />
              {qDraft.items.length > 1 && (
                <button onClick={() => setQDraft((d: any) => ({ ...d, items: d.items.filter((_: any, k: number) => k !== i) }))}
                  className="p-2 bg-red-50 text-red-500 rounded-lg active:scale-90" title="Remove item">
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
          <button onClick={() => setQDraft((d: any) => ({
            ...d, items: [...d.items, { id: 'qi' + Date.now() + Math.random().toString(36).slice(2, 5), desc: '', qty: 1, rate: 0 }]
          }))}
            className="w-full py-2 border-2 border-dashed border-purple-300 rounded-xl text-purple-500 text-xs font-black uppercase active:scale-95">
            + Add item
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label="Discount">
            <input className={inputCls} inputMode="numeric" placeholder="0 = none" value={qDraft.discount}
              onChange={e => setQDraft({ ...qDraft, discount: e.target.value })} />
          </Field>
          <Field label="Valid days">
            <input className={inputCls} inputMode="numeric" placeholder="7" value={qDraft.validDays}
              onChange={e => setQDraft({ ...qDraft, validDays: e.target.value })} />
          </Field>
        </div>
        <Field label="Note for the client (optional)">
          <textarea className={inputCls} rows={2} placeholder="Includes polish" value={qDraft.note}
            onChange={e => setQDraft({ ...qDraft, note: e.target.value })} />
        </Field>
        <div className="mt-3 flex items-center justify-between bg-purple-50 rounded-xl p-3">
          <span className="text-xs font-black uppercase text-purple-500">Total</span>
          <span className="text-lg font-black text-purple-700 tabular-nums">Rs {money(qDraftTotal)}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <button onClick={() => setQAdding(false)} className="py-4 rounded-2xl bg-gray-100 font-black uppercase active:scale-95">Cancel</button>
          <button onClick={saveQuote} className="py-4 rounded-2xl bg-purple-600 text-white font-black uppercase active:scale-95">Save</button>
        </div>
      </Modal>
    </div>
  );
}
