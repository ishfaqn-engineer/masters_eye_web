import React, { useState } from 'react';
import { Plus, Wrench, Package, RefreshCw, CalendarClock, IndianRupee } from 'lucide-react';
import { AppState, Expense, LedgerEntry, today, monthKey, monthLabel } from '../store';
import * as D from '../lib/derive';
import { money, Modal, Field, inputCls, MoneyField, PhotoInput, EditBtn, DeleteBtn, StatCard, ExportRow } from '../components/ui';
import { exportExpensesExcel, exportExpensesPdf } from '../lib/exporters';

type Props = { state: AppState; setState: (s: AppState) => void };

const CATS = ['consumable', 'asset', 'daily', 'yearly'] as const;
const icons: any = { consumable: Wrench, asset: Package, daily: RefreshCw, yearly: CalendarClock };

const blank = () => ({ label: '', amount: 0, category: 'consumable' as const, recurring: 'monthly' as const, date: today(), photo: '' });

export default function ExpensesPage({ state, setState }: Props) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [draft, setDraft] = useState<any>(blank());

  const thisMonth = today().slice(0, 7);
  const total = D.expensesTotal(state);
  const monthTotal = D.expensesTotal(state, thisMonth);

  const openEdit = (e: Expense) => { setDraft({ ...e }); setEditing(e); setAdding(true); };

  const save = () => {
    if (!draft.label.trim()) { alert('What is this expense? Give it a name first.'); return; }
    const clean = { ...draft, amount: Math.max(0, Number(draft.amount) || 0), date: draft.date || today() };
    if (editing) {
      const id = editing.id;
      const isRow = (l: LedgerEntry) => l.refId === id && l.bucket === 'expense';
      setState({
        ...state,
        expenses: state.expenses.map(x => x.id === id ? { ...x, ...clean } : x),
        ledger: state.ledger.some(isRow)
          ? state.ledger.map(l => isRow(l) ? { ...l, amount: clean.amount, date: clean.date, note: clean.label } : l)
          : [...state.ledger, {
              id: 'led-' + id, kind: 'out', bucket: 'expense', refId: id,
              amount: clean.amount, date: clean.date, note: clean.label
            } as LedgerEntry]
      });
    } else {
      const id = 'e' + Date.now() + Math.random().toString(36).slice(2, 6);
      setState({
        ...state,
        expenses: [...state.expenses, { id, ...clean } as Expense],
        // display-only row: cashPaidOut excludes bucket 'expense', cashInHand subtracts expenses array
        ledger: [...state.ledger, {
          id: 'led-' + id, kind: 'out', bucket: 'expense', refId: id,
          amount: clean.amount, date: clean.date, note: clean.label
        } as LedgerEntry]
      });
    }
    setAdding(false); setEditing(null);
  };

  const remove = (e: Expense) => {
    if (!confirm(`Delete "${e.label}"?`)) return;
    setState({
      ...state,
      expenses: state.expenses.filter(x => x.id !== e.id),
      ledger: state.ledger.filter(l => !(l.refId === e.id && l.bucket === 'expense'))
    });
  };

  const byMonth = Array.from(new Set(state.expenses.map(e => monthKey(e.date)))).sort().reverse();

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={IndianRupee} label="Total spent" value={`₹ ${money(total)}`} accent="text-teal-600" />
        <StatCard icon={CalendarClock} label="This month" value={`₹ ${money(monthTotal)}`} accent="text-orange-600" />
      </div>

      <ExportRow
        onExcel={() => exportExpensesExcel(state)}
        onPdf={() => exportExpensesPdf(state)}
      />

      <div className="space-y-3">
        {state.expenses.map(e => {
          const Icon = icons[e.category] || Wrench;
          return (
            <div key={e.id} className="bg-white rounded-2xl p-3 shadow flex items-center gap-3 border-l-8 border-teal-500">
              {e.photo
                ? <img src={e.photo} className="w-12 h-12 rounded-xl object-cover" />
                : <div className="bg-teal-100 p-3 rounded-xl"><Icon size={22} className="text-teal-700" /></div>}
              <div className="flex-1 min-w-0">
                <div className="font-black uppercase truncate">{e.label}</div>
                <div className="text-[11px] font-bold text-gray-400 uppercase">{e.category} · {e.recurring} · {e.date}</div>
              </div>
              <div className="font-black text-lg text-teal-700">₹{money(e.amount)}</div>
              <EditBtn onClick={() => openEdit(e)} />
              <DeleteBtn onClick={() => remove(e)} />
            </div>
          );
        })}
        {!state.expenses.length && <div className="text-center text-gray-300 font-bold py-6">No expenses recorded</div>}
      </div>

      <button onClick={() => { setDraft(blank()); setEditing(null); setAdding(true); }}
        className="w-full py-4 border-4 border-dashed border-teal-400 text-teal-600 font-black uppercase rounded-2xl active:scale-95 flex items-center justify-center gap-2">
        <Plus /> Add Expense / Asset
      </button>

      {byMonth.length > 0 && (
        <div className="bg-white rounded-3xl p-4 shadow">
          <div className="text-xs font-black uppercase text-gray-400 mb-2">Month by month</div>
          {byMonth.map(ym => (
            <div key={ym} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
              <span className="font-bold">{monthLabel(ym)}</span>
              <span className="font-black text-teal-700">₹{money(D.expensesTotal(state, ym))}</span>
            </div>
          ))}
        </div>
      )}

      <Modal open={adding} onClose={() => { setAdding(false); setEditing(null); }} title={editing ? 'Edit expense' : 'New expense'}>
        <div className="flex justify-center my-3">
          <PhotoInput size="w-24 h-24" round={false} value={draft.photo} onChange={(v: string) => setDraft({ ...draft, photo: v })} />
        </div>
        <Field label="What is it?"><input className={inputCls} value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} placeholder="Oil, blade, polish..." /></Field>
        <MoneyField label="Amount" value={draft.amount} onChange={(v: number) => setDraft({ ...draft, amount: v })} />
        <Field label="Type">
          <div className="grid grid-cols-2 gap-2">
            {CATS.map(c => (
              <button key={c} onClick={() => setDraft({ ...draft, category: c })}
                className={`py-3 rounded-xl font-black uppercase text-sm ${draft.category === c ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{c}</button>
            ))}
          </div>
        </Field>
        <Field label="Recurring">
          <div className="grid grid-cols-4 gap-2">
            {(['none', 'daily', 'monthly', 'yearly'] as const).map(r => (
              <button key={r} onClick={() => setDraft({ ...draft, recurring: r })}
                className={`py-3 rounded-xl font-black uppercase text-xs ${draft.recurring === r ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{r}</button>
            ))}
          </div>
        </Field>
        <Field label="Date"><input className={inputCls} type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <button onClick={() => { setAdding(false); setEditing(null); }} className="py-4 rounded-2xl bg-gray-100 font-black uppercase active:scale-95">Cancel</button>
          <button onClick={save} className="py-4 rounded-2xl bg-teal-600 text-white font-black uppercase active:scale-95">Save</button>
        </div>
      </Modal>
    </div>
  );
}
