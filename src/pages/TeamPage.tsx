import React, { useMemo, useState } from 'react';
import { Users, Wallet, FileSpreadsheet, FileDown, Pencil, CheckCircle2, Circle, Trash2, Plus, Award, CalendarDays, ChevronLeft, ChevronRight, Banknote, Landmark, IndianRupee } from 'lucide-react';
import { AppState, Worker, today, monthLabel, daysInMonth, shiftMonth } from '../store';
import * as D from '../lib/derive';
import Calendar from '../components/Calendar';
import { money, Modal, Field, inputCls, PhotoInput, MoneyField, ExportRow, WhatsAppBtn } from '../components/ui';
import { exportAttendanceExcel, exportAttendancePdf, exportAllAttendanceExcel, exportAllAttendancePdf } from '../lib/exporters';
import { wageMessage } from '../lib/whatsapp';

type Props = { state: AppState; setState: (s: AppState) => void };

export default function TeamPage({ state, setState }: Props) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const [selected, setSelected] = useState(today());
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Worker | 'master' | null>(null);
  const [draft, setDraft] = useState({ name: '', photo: '', rate: 1500, phone: '' });
  // member history: which roster row is open + which month it is showing
  const [detailId, setDetailId] = useState<string | null>(null);
  const [dMonth, setDMonth] = useState(today().slice(0, 7));

  const crewSize = state.workers.length + 1;
  const day = D.dayOf(state, selected);
  const present = new Set(day.presentIds);

  const updateDay = (patch: Partial<typeof day>) => {
    const next = { ...day, ...patch };
    const empty = !next.masterPresent && next.presentIds.length === 0;
    const attendance = empty
      ? state.attendance.filter(a => a.date !== selected)          // never keep empty rows
      : state.attendance.some(a => a.date === selected)
        ? state.attendance.map(a => a.date === selected ? next : a)
        : [...state.attendance, next];
    setState({ ...state, attendance });
  };

  const toggleWorker = (id: string) => {
    const next = new Set(present);
    if (next.has(id)) next.delete(id); else next.add(id);
    updateDay({ presentIds: [...next] });
  };

  const clearDay = () => {
    if (!confirm(`Clear attendance for ${selectedLabel}?`)) return;
    // drop the record entirely so "days marked" counters never count an empty day
    setState({ ...state, attendance: state.attendance.filter(a => a.date !== selected) });
  };

  const removeOne = (id: string) => {
    const next = new Set(present);
    next.delete(id);
    updateDay({ presentIds: [...next] });
  };

  const startEdit = (t: Worker | 'master') => {
    if (t === 'master') setDraft({ name: state.settings.masterName, photo: state.settings.masterPhoto, rate: state.settings.masterRate, phone: '' });
    else setDraft({ name: t.name, photo: t.photo, rate: t.rate, phone: t.phone || '' });
    setEditing(t);
  };

  const dirtyDraft = () => {
    if (!editing) return false;
    if (editing === 'master')
      return draft.name !== state.settings.masterName || draft.photo !== state.settings.masterPhoto || draft.rate !== state.settings.masterRate;
    const w = state.workers.find(x => x.id === (editing as Worker).id);
    if (!w) return false;
    return draft.name !== w.name || draft.photo !== w.photo || draft.rate !== w.rate || draft.phone !== (w.phone || '');
  };

  const saveEdit = () => {
    if (!editing) return;
    if (editing === 'master') {
      setState({ ...state, settings: { ...state.settings, masterName: draft.name || 'Master', masterPhoto: draft.photo, masterRate: Math.max(0, draft.rate) } });
    } else {
      setState({
        ...state,
        workers: state.workers.map(w => w.id === (editing as Worker).id
          ? { ...w, name: draft.name || w.name, photo: draft.photo, rate: Math.max(0, draft.rate), phone: draft.phone.replace(/\D/g, '') }
          : w)
      });
    }
    setEditing(null);
  };

  const addWorker = () => {
    if (!draft.name.trim()) { alert('Type a name first.'); return; }
    setState({
      ...state,
      workers: [...state.workers, { id: 'w' + Date.now(), name: draft.name, photo: draft.photo, rate: Math.max(0, draft.rate), phone: draft.phone.replace(/\D/g, '') }]
    });
    setDraft({ name: '', photo: '', rate: 1500, phone: '' });
    setAdding(false);
  };

  const removeWorker = (w: Worker) => {
    if (!confirm(`Remove ${w.name} from the crew? Their wage payments stay in the books.`)) return;
    setState({
      ...state,
      workers: state.workers.filter(x => x.id !== w.id),
      // drop the worker from future marks, and never leave a day with nobody in it
      attendance: state.attendance
        .map(a => ({ ...a, presentIds: a.presentIds.filter(id => id !== w.id) }))
        .filter(a => a.masterPresent || a.presentIds.length > 0),
      // keep wage payments tagged so the cash history survives
      ledger: state.ledger.map(l =>
        l.bucket === 'wage' && l.refId === w.id ? D.markOrphaned(l) : l
      )
    });
  };

  const selectedLabel = new Date(selected + 'T00:00:00').toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' });
  // net of what has already been paid — same number as Dashboard & Payments
  const monthWages = D.crewWagesRemaining(state, month);

  const openDetail = (id: string) => { setDetailId(id); setDMonth(month); };

  /* history modal data — one member, one month, day by day + cash taken */
  const detailRow: any = detailId === 'master'
    ? { id: 'master', name: state.settings.masterName, photo: state.settings.masterPhoto, rate: state.settings.masterRate }
    : state.workers.find(w => w.id === detailId);
  const detailDays = detailId === 'master' ? D.masterDays(state, dMonth)
    : detailId ? D.workerDays(state, detailId, dMonth) : 0;
  const detailEarned = detailDays * (detailRow?.rate || 0);
  const detailPaid = detailId ? D.paidWages(state, detailId, dMonth) : 0;
  const detailDue = detailId ? D.wageRemaining(state, detailId, dMonth) : 0;
  const detailPayments = detailId
    ? state.ledger.filter(l => l.bucket === 'wage' && l.refId === detailId)
        .slice().sort((a, b) => b.date.localeCompare(a.date))
    : [];
  const dDim = daysInMonth(dMonth);
  const dFirstDow = (new Date(dMonth + '-01T00:00:00').getDay() + 6) % 7; // Monday = 0
  const dayState = (d: string): 'present' | 'absent' | 'none' => {
    const rec = state.attendance.find(a => a.date === d);
    if (!rec) return 'none';
    const on = detailId === 'master' ? rec.masterPresent : rec.presentIds.includes(detailId!);
    return on ? 'present' : 'absent';
  };

  const rows = useMemo(
    () => [{ id: 'master' as const, name: state.settings.masterName, photo: state.settings.masterPhoto, rate: state.settings.masterRate, phone: state.settings.whatsappNumber },
    ...state.workers.map(w => ({ ...w, phone: w.phone || '' }))],
    [state]
  );

  return (
    <div className="p-4 space-y-4">
      <Calendar
        state={state}
        selected={selected}
        onSelect={d => { setSelected(d); setMonth(d.slice(0, 7)); }}
        month={month}
        onMonth={setMonth}
      />

      {/* Selected day — one click per person, reversible */}
      <div className="bg-white rounded-3xl shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] font-black uppercase text-gray-400">Marking for</div>
            <div className="font-black uppercase">{selectedLabel}</div>
          </div>
          <button onClick={clearDay} className="text-[10px] font-black uppercase text-red-500 bg-red-50 px-3 py-2 rounded-xl active:scale-95">
            Clear this day
          </button>
        </div>

        {/* outer is a div (not a button) so the edit button can't nest inside it,
            and its click can't double as an attendance toggle */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => updateDay({ masterPresent: !day.masterPresent })}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); updateDay({ masterPresent: !day.masterPresent }); } }}
          className={`w-full flex items-center gap-3 p-3 rounded-2xl mb-3 transition active:scale-95 border-4 cursor-pointer
            ${day.masterPresent ? 'border-green-500 bg-green-50' : 'border-gray-100 bg-gray-50'}`}
        >
          <img src={state.settings.masterPhoto || `https://i.pravatar.cc/300?u=master`} className="w-14 h-14 rounded-full object-cover" alt="" />
          <div className="flex-1 text-left">
            <div className="text-[10px] font-black uppercase text-gray-400">Master</div>
            <div className="font-black uppercase">{state.settings.masterName}</div>
            <button onClick={e => { e.stopPropagation(); startEdit('master'); }} title="Edit master rate"
              className="text-xs font-bold text-wood bg-wood/10 px-2 py-0.5 rounded-lg active:scale-95 mt-0.5">
              Rs {money(state.settings.masterRate)}/day ✎
            </button>
          </div>
          {day.masterPresent
            ? <CheckCircle2 size={34} className="text-green-500" />
            : <Circle size={34} className="text-gray-300" />}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {state.workers.map(w => {
            const on = present.has(w.id);
            return (
              <div key={w.id} className={`rounded-2xl overflow-hidden border-4 transition ${on ? 'border-green-500 bg-green-50' : 'border-gray-100 bg-gray-50'}`}>
                <button onClick={() => toggleWorker(w.id)} className="w-full active:scale-95 transition">
                  <img src={w.photo || `https://i.pravatar.cc/150?u=${w.id}`} className="w-full h-20 object-cover" />
                  <div className="py-1.5 font-black uppercase text-xs text-center">{w.name}</div>
                </button>
                <div className="px-2 pb-2 flex items-center justify-between">
                  <button onClick={() => startEdit(w)} title="Edit name, photo & rate"
                    className="text-[10px] font-black text-wood bg-wood/10 px-2 py-1 rounded-lg active:scale-95">
                    Rs{money(w.rate)}/day ✎
                  </button>
                  {on && (
                    <button onClick={() => removeOne(w.id)} title="Remove mark" aria-label="Remove mark" className="p-1.5 -m-1 text-red-400 active:scale-90">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-center text-xs font-black text-gray-400 mt-3 uppercase">
          {day.presentIds.length + (day.masterPresent ? 1 : 0)} / {crewSize} present · tap photo to toggle
        </div>
      </div>

      {/* Month summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-4 shadow flex items-center gap-3">
          <div className="bg-blue-100 p-2 rounded-xl"><Users size={22} className="text-blue-600" /></div>
          <div>
            <div className="text-[10px] font-black uppercase text-gray-400">Days marked this month</div>
            <div className="text-xl font-black">{state.attendance.filter(a => a.date.startsWith(month) && (a.masterPresent || a.presentIds.length > 0)).length}</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow flex items-center gap-3">
          <div className="bg-red-100 p-2 rounded-xl"><Wallet size={22} className="text-red-600" /></div>
          <div>
            <div className="text-[10px] font-black uppercase text-gray-400">Still to pay ({monthLabel(month)})</div>
            <div className="text-xl font-black text-red-600">Rs {money(monthWages)}</div>
          </div>
        </div>
      </div>

      {/* Export whole month */}
      <div className="bg-white rounded-3xl shadow p-4">
        <div className="font-black uppercase text-sm mb-1">Monthly report — all crew</div>
        <div className="text-xs text-gray-400 font-bold mb-3">{monthLabel(month)} · export to Excel or PDF</div>
        <ExportRow
          onExcel={() => exportAllAttendanceExcel(state, month)}
          onPdf={() => exportAllAttendancePdf(state, month)}
        />
      </div>

      {/* Crew roster with per-worker report + whatsapp + rate edit */}
      <div className="bg-white rounded-3xl shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-black uppercase text-sm">Crew roster</div>
          <button onClick={() => { setAdding(true); setEditing(null); setDraft({ name: '', photo: '', rate: 1500, phone: '' }); }}
            className="flex items-center gap-1 text-xs font-black uppercase text-wood bg-wood/10 px-3 py-2 rounded-xl active:scale-95">
            <Plus size={16} /> Add
          </button>
        </div>

        <div className="space-y-3">
          {rows.map(r => {
            const isMaster = r.id === 'master';
            const days = isMaster ? D.masterDays(state, month) : D.workerDays(state, r.id, month);
            const allDays = isMaster ? D.masterDays(state) : D.workerDays(state, r.id);
            const wage = days * r.rate;
            const phone = r.phone || '';
            return (
              <div key={r.id} className="border-2 border-gray-100 rounded-2xl p-3">
                <div className="flex items-center gap-3">
                  <button onClick={() => openDetail(r.id)} title="Attendance & payments history"
                    className="shrink-0 active:scale-95 transition">
                    <img src={r.photo || `https://i.pravatar.cc/150?u=${r.id}`} className="w-14 h-14 rounded-full object-cover" alt="" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-black uppercase truncate">{r.name}</span>
                      {isMaster && <Award size={14} className="text-wood shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <button onClick={() => startEdit(isMaster ? 'master' : r as Worker)} title="Edit rate"
                        className="flex items-center gap-1.5 text-xs font-black text-wood bg-wood/10 px-2 py-1 rounded-lg active:scale-95">
                        Rs {money(r.rate)}/day <Pencil size={12} />
                      </button>
                      <button onClick={() => openDetail(r.id)} title="Attendance & payments history"
                        className="flex items-center gap-1 text-[11px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg active:scale-95">
                        <CalendarDays size={12} /> History
                      </button>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-black uppercase text-gray-400">Total days</div>
                    <div className="text-2xl font-black">{allDays}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div className="bg-gray-50 rounded-xl py-2">
                    <div className="text-[9px] font-black uppercase text-gray-400">Days ({monthLabel(month).split(' ')[0]})</div>
                    <div className="font-black text-lg">{days}</div>
                  </div>
                  <div className="bg-gray-50 rounded-xl py-2">
                    <div className="text-[9px] font-black uppercase text-gray-400">Earned</div>
                    <div className="font-black text-lg text-blue-600">{money(wage)}</div>
                  </div>
                  <div className="bg-blue-50 rounded-xl py-2">
                    <div className="text-[9px] font-black uppercase text-blue-400">To pay ({monthLabel(month).split(' ')[0]})</div>
                    <div className="font-black text-lg text-blue-700">{money(D.wageRemaining(state, r.id, month))}</div>
                  </div>
                </div>

                {!isMaster && (
                  <button onClick={() => removeWorker(r as Worker)}
                    className="mt-2 w-full text-[10px] font-black uppercase text-red-400 bg-red-50 py-1.5 rounded-lg active:scale-95">
                    Remove from crew
                  </button>
                )}

                <div className="grid grid-cols-3 gap-2 mt-2">
                  <button onClick={() => exportAttendanceExcel(state, month, r.id)}
                    className="py-2 rounded-xl bg-green-700 text-white text-[11px] font-black uppercase active:scale-95 flex items-center justify-center gap-1">
                    <FileSpreadsheet size={14} /> Excel
                  </button>
                  <button onClick={() => exportAttendancePdf(state, month, r.id)}
                    className="py-2 rounded-xl bg-red-600 text-white text-[11px] font-black uppercase active:scale-95 flex items-center justify-center gap-1">
                    <FileDown size={14} /> PDF
                  </button>
                  <WhatsAppBtn phone={phone} message={wageMessage(state, r.id, month)} label="Send" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Member history — month of daily attendance + every payment taken */}
      <Modal open={!!detailId && !!detailRow} onClose={() => setDetailId(null)} title={detailRow?.name || 'History'}>
        {detailRow && (
          <>
            <div className="flex items-center gap-3 mb-3">
              <img src={detailRow.photo || `https://i.pravatar.cc/150?u=${detailRow.id}`} className="w-14 h-14 rounded-full object-cover" alt="" />
              <div className="flex-1 min-w-0">
                <div className="font-black uppercase truncate">{detailRow.name}</div>
                <div className="text-xs font-bold text-gray-400">Rs {money(detailRow.rate)}/day · {detailId === 'master' ? D.masterDays(state) : D.workerDays(state, detailRow.id)} days all time</div>
              </div>
            </div>

            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setDMonth(m => shiftMonth(m, -1))} title="Previous month"
                className="p-2 bg-gray-100 rounded-xl active:scale-90"><ChevronLeft size={18} /></button>
              <div className="font-black uppercase text-sm">{monthLabel(dMonth)}</div>
              <button onClick={() => setDMonth(m => shiftMonth(m, 1))} title="Next month"
                className="p-2 bg-gray-100 rounded-xl active:scale-90"><ChevronRight size={18} /></button>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-3">
              <div className="bg-gray-50 rounded-xl p-2 text-center">
                <div className="text-[9px] font-black uppercase text-gray-400">Days</div>
                <div className="font-black text-lg">{detailDays}</div>
              </div>
              <div className="bg-blue-50 rounded-xl p-2 text-center">
                <div className="text-[9px] font-black uppercase text-blue-400">Earned</div>
                <div className="font-black text-lg text-blue-600">{money(detailEarned)}</div>
              </div>
              <div className="bg-green-50 rounded-xl p-2 text-center">
                <div className="text-[9px] font-black uppercase text-green-500">Taken</div>
                <div className="font-black text-lg text-green-600">{money(detailPaid)}</div>
              </div>
              <div className="bg-red-50 rounded-xl p-2 text-center">
                <div className="text-[9px] font-black uppercase text-red-400">Due</div>
                <div className="font-black text-lg text-red-600">{money(detailDue)}</div>
              </div>
            </div>

            <div className="text-xs font-black uppercase text-gray-400 mb-1.5">Daily attendance</div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-gray-400 mb-1">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {Array.from({ length: dFirstDow }).map((_, i) => <div key={'b' + i} />)}
              {Array.from({ length: dDim }).map((_, i) => {
                const d = `${dMonth}-${String(i + 1).padStart(2, '0')}`;
                const st = dayState(d);
                const future = d > today();
                return (
                  <div key={d} title={`${d} — ${st === 'present' ? 'present' : st === 'absent' ? 'absent' : 'no record'}`}
                    className={`aspect-square rounded-lg flex items-center justify-center font-black text-[11px]
                      ${st === 'present' ? 'bg-green-500 text-white'
                        : st === 'absent' ? 'bg-red-100 text-red-500 border border-red-200'
                          : future ? 'bg-white text-gray-200 border border-gray-100' : 'bg-gray-50 text-gray-300'}`}>
                    {i + 1}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3 text-[10px] font-black uppercase text-gray-400 mb-4">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-green-500" /> Present</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-300" /> Absent</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-gray-100 border border-gray-200" /> No record</span>
            </div>

            <div className="text-xs font-black uppercase text-gray-400 mb-1">Payments taken</div>
            {detailPayments.length === 0 && (
              <div className="text-center text-gray-300 font-bold py-4 text-xs">No wage payments yet</div>
            )}
            {detailPayments.map(l => (
              <div key={l.id} className="flex items-center gap-2.5 py-2 border-b border-gray-100 last:border-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${l.method === 'online' ? 'bg-blue-50' : l.method === 'cash' ? 'bg-green-50' : 'bg-gray-50'}`}>
                  {l.method === 'online'
                    ? <Landmark size={16} className="text-blue-600" />
                    : l.method === 'cash'
                      ? <Banknote size={16} className="text-green-600" />
                      : <IndianRupee size={16} className="text-gray-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-black uppercase">{l.date}</div>
                  <div className="text-[11px] font-bold text-gray-400 truncate">{l.note}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-black text-sm text-red-600">− {money(l.amount)}</div>
                  <div className={`text-[9px] font-black uppercase ${l.method === 'online' ? 'text-blue-500' : l.method === 'cash' ? 'text-green-600' : 'text-gray-400'}`}>
                    {l.method || 'not set'}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </Modal>

      {/* Edit / add modal */}
      <Modal open={!!editing || adding} onClose={() => { setEditing(null); setAdding(false); }} dirty={editing ? dirtyDraft : undefined} title={editing ? 'Edit member' : 'New worker'}>
        <div className="flex justify-center my-3">
          <PhotoInput value={draft.photo} onChange={(v: string) => setDraft({ ...draft, photo: v })} />
        </div>
        <Field label="Name"><input className={inputCls} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></Field>
        <MoneyField label="Daily rate (you set it)" value={draft.rate} onChange={(v: number) => setDraft({ ...draft, rate: v })} />
        {editing !== 'master' && (
          <Field label="WhatsApp number (for wage messages)">
            <input className={inputCls} value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })}
              placeholder="03001234567" inputMode="tel" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => { setEditing(null); setAdding(false); }}
            className="py-4 rounded-2xl bg-gray-100 font-black uppercase active:scale-95">Cancel</button>
          <button onClick={editing ? saveEdit : addWorker}
            className="py-4 rounded-2xl bg-wood text-white font-black uppercase active:scale-95">Save</button>
        </div>
      </Modal>
    </div>
  );
}
