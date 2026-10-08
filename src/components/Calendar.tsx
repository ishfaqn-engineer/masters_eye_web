import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AppState, daysInMonth, shiftMonth, monthLabel, today } from '../store';
import { presentCountOn, dayOf } from '../lib/derive';

/* Month strip calendar.
   Each cell = a day, showing how many crew (incl. master) were present.
   Tap a day -> selects it for attendance editing (only ONE tap marks a person
   for that day; tapping again removes it, so mis-taps are reversible). */

type Props = {
  state: AppState;
  selected: string;
  onSelect: (date: string) => void;
  month: string;
  onMonth: (m: string) => void;
};

const weekday = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function Calendar({ state, selected, onSelect, month, onMonth }: Props) {
  const [, m] = month.split('-').map(Number);
  const dim = daysInMonth(month);
  const first = new Date(Number(month.slice(0, 4)), m - 1, 1).getDay();
  const todayStr = today();

  /* navigating months must never leave the marking panel on a hidden date */
  const goMonth = (next: string) => {
    onMonth(next);
    if (selected.slice(0, 7) !== next) {
      const fallback = next === todayStr.slice(0, 7) ? todayStr : `${next}-01`;
      onSelect(fallback);
    }
  };

  const cells: (string | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length: dim }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];

  const crewSize = state.workers.length + 1;
  const marked = state.attendance.filter(a => a.date.startsWith(month) && (a.masterPresent || a.presentIds.length > 0)).length;

  return (
    <div className="bg-white rounded-3xl shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => goMonth(shiftMonth(month, -1))} className="p-2 bg-gray-100 rounded-full active:scale-90">
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <div className="font-black uppercase text-sm">{monthLabel(month)}</div>
          <div className="text-[10px] font-bold text-gray-400">
            {marked} day{marked === 1 ? '' : 's'} marked · {crewSize} crew
          </div>
        </div>
        <button onClick={() => goMonth(shiftMonth(month, 1))} className="p-2 bg-gray-100 rounded-full active:scale-90">
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {weekday.map((d, i) => <div key={i} className="text-[10px] font-black text-gray-300">{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={'e' + i} />;
          const d = dayOf(state, date);
          const count = presentCountOn(state, date);
          const isSel = date === selected;
          const movements = state.ledger.filter(l => l.date === date);
          const received = movements.filter(l => l.kind === 'in').reduce((n,l)=>n+l.amount,0);
          const paid = movements.filter(l => l.kind === 'out').reduce((n,l)=>n+l.amount,0);
          const attendanceMarked = state.attendance.some(a=>a.date===date);
          const isToday = date === todayStr;
          const dayNum = Number(date.slice(-2));
          return (
            <button
              key={date}
              onClick={() => onSelect(date)}
              className={`relative aspect-square rounded-xl flex flex-col items-center justify-center transition active:scale-90
                ${isSel ? 'bg-wood-dark text-white shadow-lg scale-105' : count > 0 ? 'bg-green-100 text-green-900' : 'bg-gray-50 text-gray-400'}
                ${isToday && !isSel ? 'ring-2 ring-wood' : ''}`}
            >
              <span className="text-[11px] font-black leading-none">{dayNum}</span>
              {count > 0 && (
                <span className={`text-[8px] font-black leading-none mt-0.5 ${isSel ? 'text-white/80' : 'text-green-700'}`}>
                  {count}/{crewSize}
                </span>
              )}
              {attendanceMarked && <span className="text-[8px] font-black">✓{count} ✕{Math.max(0,crewSize-count)}</span>}
              {movements.length > 0 && <span className="text-[8px] font-black">₹{received ? '+'+received : ''}{paid ? ' −'+paid : ''}</span>}
              {d.masterPresent && (
                <span className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-blue-500'}`} />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-4 mt-3 text-[10px] font-black uppercase text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> present</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> master on duty</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-wood-dark" /> selected</span>
      </div>
    </div>
  );
}
