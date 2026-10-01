import React from 'react';
import { Plus, X, DoorOpen, PanelsTopLeft, Ruler, TreePine } from 'lucide-react';
import { OrderSpecs, SpecLine, specWoodTotal, allSpecLines } from '../store';
import { DesignPicker } from './ui';

const newLineId = () => 'sl' + Date.now() + Math.random().toString(36).slice(2, 5);
const miniCls = 'border-2 border-gray-200 rounded-lg px-1.5 py-1.5 text-sm font-bold text-center bg-white outline-none focus:border-wood';

type SectionProps = {
  title: string;
  icon: React.ReactNode;
  lines: SpecLine[];
  onLines: (l: SpecLine[]) => void;
  addLabel: string;
  defaultLabel: string;
};

const Section = ({ title, icon, lines, onLines, addLabel, defaultLabel }: SectionProps) => {
  const upd = (id: string, patch: Partial<SpecLine>) =>
    onLines(lines.map(l => l.id === id ? { ...l, ...patch } : l));
  const add = () =>
    onLines([...lines, { id: newLineId(), label: defaultLabel, qty: 1, widthIn: 36, heightIn: 84, woodCft: 0 }]);
  const wood = lines.reduce((a, l) => a + (Number(l.woodCft) || 0), 0);
  const nums: [string, keyof SpecLine][] = [['Qty', 'qty'], ['W"', 'widthIn'], ['H"', 'heightIn'], ['cft', 'woodCft']];
  return (
    <div className="border-2 border-gray-100 rounded-2xl p-2.5 mb-2.5">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <div className="flex items-center gap-1.5 font-black uppercase text-xs text-gray-500">
          {icon} {title} <span className="text-wood">· {lines.length}</span>
        </div>
        <div className="text-[11px] font-black text-gray-400">{wood} cft</div>
      </div>

      {lines.map(l => (
        <div key={l.id} className="bg-gray-50 rounded-xl p-2 mb-2">
          <div className="flex gap-1.5 mb-1.5">
            <input
              className="flex-1 min-w-0 border-2 border-gray-200 rounded-lg px-2 py-1.5 text-sm font-bold bg-white outline-none focus:border-wood"
              placeholder={defaultLabel}
              value={l.label}
              onChange={e => upd(l.id, { label: e.target.value })}
            />
            <button
              type="button"
              title={`Remove ${l.label || defaultLabel}`}
              onClick={() => onLines(lines.filter(x => x.id !== l.id))}
              className="p-1.5 text-red-400 active:scale-90"
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {nums.map(([ph, k]) => (
              <input
                key={k}
                type="number"
                min={0}
                placeholder={ph}
                value={String(l[k] ?? '')}
                onChange={e => upd(l.id, { [k]: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value) || 0) } as Partial<SpecLine>)}
                className={miniCls}
              />
            ))}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 font-black uppercase text-xs active:scale-95 flex items-center justify-center gap-1"
      >
        <Plus size={14} /> {addLabel}
      </button>
    </div>
  );
};

/* the structured order sheet — count / dimensions / wood for doors, windows of
   different sizes and named "other" categories, plus design image uploads */
export const SpecEditor = ({ specs, onChange }: { specs: OrderSpecs; onChange: (s: OrderSpecs) => void }) => {
  const total = specWoodTotal(specs);
  const count = allSpecLines(specs).length;
  return (
    <div>
      <div className="text-xs font-black uppercase text-gray-400 mb-1.5">Order details — count, size & wood</div>
      <Section
        title="Doors"
        icon={<DoorOpen size={15} className="text-orange-500" />}
        lines={specs.doors}
        onLines={l => onChange({ ...specs, doors: l })}
        addLabel="Add door"
        defaultLabel="Door"
      />
      <Section
        title="Windows (different sizes)"
        icon={<PanelsTopLeft size={15} className="text-blue-500" />}
        lines={specs.windows}
        onLines={l => onChange({ ...specs, windows: l })}
        addLabel="Add window size"
        defaultLabel="Window"
      />
      <Section
        title="Others (other 1, other 2 …)"
        icon={<Ruler size={15} className="text-wood" />}
        lines={specs.others}
        onLines={l => onChange({ ...specs, others: l })}
        addLabel="Add other item"
        defaultLabel={`Other ${specs.others.length + 1}`}
      />

      <div className="flex items-center justify-between bg-wood/10 rounded-xl px-3 py-2.5 mb-3">
        <span className="text-xs font-black uppercase text-wood flex items-center gap-1.5"><TreePine size={15} /> Total wood required</span>
        <span className="font-black text-wood">{total} cft · {count} lines</span>
      </div>

      <div className="mb-1">
        <div className="text-xs font-black uppercase text-gray-400 mb-1.5">Designs — sketches & photos (saved with this order)</div>
        <DesignPicker values={specs.designs} onChange={v => onChange({ ...specs, designs: v })} />
      </div>
    </div>
  );
};

/* compact read-only rendering for order cards (master + client views) */
export const SpecSummary = ({ specs }: { specs?: OrderSpecs }) => {
  /* designs are data: URLs — Chrome & Firefox refuse top-frame navigation to
     them, so a plain target="_blank" link opens nothing. Show it in-app instead. */
  const [zoom, setZoom] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoom(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);

  const s = specs;
  if (!s) return null;
  const sections: [React.ReactNode, SpecLine[]][] = [
    [<DoorOpen key="d" size={13} className="text-orange-500 shrink-0" />, s.doors],
    [<PanelsTopLeft key="w" size={13} className="text-blue-500 shrink-0" />, s.windows],
    [<Ruler key="o" size={13} className="text-wood shrink-0" />, s.others],
  ];
  const lines = allSpecLines(s);
  const designs = s.designs.filter(Boolean);
  if (!lines.length && !designs.length) return null;
  return (
    <div className="mt-2 space-y-1">
      {sections.map(([icon, ls], i) => ls.length ? (
        <div key={i}>
          {ls.map(l => (
            <div key={l.id} className="flex items-center gap-1.5 text-[11px] font-bold text-gray-600 leading-snug">
              {icon}
              <span className="font-black text-gray-800">{l.qty}×</span>
              <span className="truncate">{l.label || 'Item'}{l.widthIn > 0 && l.heightIn > 0 ? ` ${l.widthIn}"×${l.heightIn}"` : ''}</span>
              {l.woodCft > 0 ? <span className="text-wood font-black shrink-0">· {l.woodCft} cft</span> : null}
            </div>
          ))}
        </div>
      ) : null)}
      {specWoodTotal(s) > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] font-black text-wood">
          <TreePine size={13} /> Total wood required: {specWoodTotal(s)} cft
        </div>
      )}
      {designs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {designs.map((d, i) => (
            <button key={i} type="button" onClick={() => setZoom(d)} title="Open design full size"
              className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 active:scale-95">
              <img src={d} className="w-full h-full object-cover" alt="" />
            </button>
          ))}
        </div>
      )}

      {/* full-size viewer — stays inside the app instead of a blocked new tab */}
      {zoom && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setZoom(null)} role="dialog" aria-label="Design full size">
          <img src={zoom} alt="" className="max-w-full max-h-full rounded-xl object-contain shadow-2xl" />
          <button type="button" onClick={() => setZoom(null)} aria-label="Close"
            className="absolute top-4 right-4 p-2.5 rounded-full bg-white/15 text-white active:scale-90">
            <X size={20} />
          </button>
        </div>
      )}
    </div>
  );
};
