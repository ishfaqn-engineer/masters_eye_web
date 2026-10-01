import React, { useEffect, useState } from 'react';
import { Camera, X, FileText, Image as ImageIcon, Trash2, MessageCircle, FileSpreadsheet, FileDown, Pencil, Loader2 } from 'lucide-react';
import { putFile, urlFor, getMeta } from '../lib/files';
import { waLink } from '../lib/whatsapp';

export const money = (n: number) => n.toLocaleString('en-US');

export const Header = ({ title, showBack, onBack, right }: any) => (
  <div className="bg-wood-dark text-white p-4 flex items-center justify-between sticky top-0 z-20 shadow-lg">
    <div className="flex items-center gap-3 min-w-0">
      {showBack && (
        <button onClick={onBack} className="p-2 bg-white/15 rounded-full active:scale-90 transition shrink-0">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
      )}
      <h1 className="text-lg font-black uppercase tracking-tight truncate">{title}</h1>
    </div>
    {right}
  </div>
);

export const BigButton = ({ icon: Icon, label, color, onClick }: any) => (
  <button
    onClick={onClick}
    className={`${color} text-white p-5 rounded-3xl shadow-xl flex flex-col items-center justify-center gap-3 active:scale-95 transition-transform border-b-[6px] border-black/20 min-h-[130px]`}
  >
    <Icon size={44} />
    <span className="text-sm font-black uppercase tracking-wide text-center leading-tight">{label}</span>
  </button>
);

export const StatCard = ({ label, value, accent = 'text-gray-900', sub, icon: Icon }: any) => (
  <div className="bg-white rounded-2xl p-4 shadow border border-gray-100 flex items-center gap-3">
    {Icon && <div className="bg-wood/10 p-2 rounded-xl shrink-0"><Icon size={22} className="text-wood" /></div>}
    <div className="min-w-0">
      <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</div>
      <div className={`text-xl font-black ${accent} truncate`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-400 font-semibold truncate">{sub}</div>}
    </div>
  </div>
);

/* dirty = optional guard: returns true when the form has unsaved changes,
   so a stray backdrop tap asks before throwing the draft away */
export const Modal = ({ open, onClose, title, children, dirty }: any) => {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const safeClose = () => {
    if (dirty && typeof dirty === 'function' && dirty()) {
      if (!confirm('Discard your changes?')) return;
    }
    onClose?.();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center" onClick={safeClose}>
      <div className="bg-white w-full max-w-md rounded-t-3xl p-5 max-h-[90vh] overflow-y-auto overscroll-contain pb-[calc(env(safe-area-inset-bottom)+1.5rem)]" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 sticky top-0 bg-white -mx-5 px-5 pt-1 pb-3 z-10">
          <h3 className="text-lg font-black uppercase">{title}</h3>
          <button onClick={safeClose} className="p-2 bg-gray-100 rounded-full"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
};

/* plain div, not <label> — several forms put BUTTONS inside Field, and a label
   forwards clicks to its first input, silently mutating the draft */
export const Field = ({ label, children }: any) => (
  <div className="block mb-3">
    <span className="text-xs font-black uppercase text-gray-400 block mb-1">{label}</span>
    {children}
  </div>
);

export const inputCls = 'w-full border-2 border-gray-200 rounded-xl p-3 font-bold text-lg focus:border-wood outline-none bg-white';

/* downscale to ~900px so a phone photo can't blow localStorage quota.
   Guards every path so the callback always fires exactly once (no silent hang). */
const readPhoto = (file: File, cb: (dataUrl: string) => void) => {
  let fired = false;
  let timer = 0;
  const finish = (v: string) => {
    if (fired) return;
    fired = true;
    if (timer) window.clearTimeout(timer);
    cb(v);
  };
  // if decode stalls (corrupt file), give up rather than blocking the form
  timer = window.setTimeout(() => finish(''), 15000);

  const r = new FileReader();
  r.onerror = () => finish('');
  r.onload = () => {
    const raw = String(r.result || '');
    if (!raw) { finish(raw); return; }
    const img = new Image();
    img.onerror = () => finish('');
    img.onload = () => {
      const MAX = 900;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height) || 1);
      if (!(scale > 0) || scale === 1) { finish(raw); return; }
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      if (!ctx) { finish(raw); return; }
      // white behind the image so transparent PNGs don't come out black
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      try {
        finish(c.toDataURL('image/jpeg', 0.75));
      } catch {
        finish(raw);
      }
    };
    img.src = raw;
  };
  r.readAsDataURL(file);
};

/* photo or gallery picker (camera if the OS offers it) */
export const PhotoInput = ({ value, onChange, round = true, size = 'w-32 h-32' }: any) => (
  <div className="relative inline-flex flex-col items-center gap-2">
    <label className="flex flex-col items-center gap-2 cursor-pointer">
      <div className={`${round ? 'rounded-full' : 'rounded-2xl'} ${size} bg-gray-100 border-4 border-dashed border-wood flex items-center justify-center overflow-hidden`}>
        {value ? <img src={value} alt="photo" className="w-full h-full object-cover" /> : <Camera size={36} className="text-wood" />}
      </div>
      <span className="text-xs font-black uppercase text-wood">Take Photo</span>
      <input type="file" accept="image/*" className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) readPhoto(f, v => { if (v) onChange(v); else alert('That image could not be read. Try another photo.'); });
        }} />
    </label>
    {value && (
      <button
        type="button"
        onClick={e => { e.preventDefault(); e.stopPropagation(); onChange(''); }}
        title="Remove photo"
        className="absolute top-0 right-0 bg-red-500 text-white rounded-full p-1.5 shadow active:scale-90"
      >
        <X size={14} />
      </button>
    )}
  </div>
);

/* multi-image design picker — stores down-scaled data-URLs inside state, so a
   client's design uploads travel with Drive sync and file backup (IndexedDB
   attachments would stay stuck on the device that uploaded them) */
export const DesignPicker = ({ values, onChange, max = 12, label = 'Add design photo' }: {
  values: string[]; onChange: (v: string[]) => void; max?: number; label?: string;
}) => (
  <div className="flex flex-wrap gap-2">
    {values.map((v, i) => v ? (
      <div key={i} className="relative w-16 h-16">
        <img src={v} className="w-full h-full object-cover rounded-xl border-2 border-gray-200" alt="" />
        <button
          type="button"
          onClick={() => onChange(values.filter((_, j) => j !== i))}
          title="Remove design"
          className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-1 shadow active:scale-90"
        >
          <X size={11} />
        </button>
      </div>
    ) : null)}
    {values.length < max && (
      <label title={label} className="w-16 h-16 rounded-xl border-4 border-dashed border-orange-300 bg-orange-50 flex items-center justify-center text-orange-500 cursor-pointer active:scale-95">
        <ImageIcon size={20} />
        <input type="file" accept="image/*" className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            readPhoto(f, v => {
              if (v) onChange([...values, v]);
              else alert('That image could not be read. Try another photo.');
            });
          }} />
      </label>
    )}
  </div>
);

/* attachment chips with thumbnail / pdf badge */
export const AttachmentList = ({ ids, onRemove }: { ids: string[]; onRemove?: (id: string) => void }) => {
  const [items, setItems] = useState<Record<string, { url: string | null; pdf: boolean; name: string }>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, any> = {};
      try {
        for (const id of ids) {
          try {
            const url = await urlFor(id);
            const meta = await getMeta(id);
            out[id] = { url, pdf: meta?.type === 'pdf', name: meta?.name || 'file' };
          } catch {
            out[id] = { url: null, pdf: false, name: 'unavailable' };
          }
        }
      } catch { /* leave whatever we have */ }
      if (alive) setItems(out);
    })();
    return () => { alive = false; };
  }, [ids.join(',')]);

  if (!ids.length) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {ids.map(id => {
        const it = items[id];
        const loaded = it !== undefined;
        const isPdf = loaded && it.pdf;
        const url = loaded ? it.url : null;
        return (
          <div key={id} className="relative">
            <a
              href={url || undefined}
              target="_blank"
              rel="noreferrer"
              title={loaded ? it.name : 'loading…'}
              onClick={e => { if (!url) e.preventDefault(); }}
              className="block w-20 h-20 rounded-xl overflow-hidden border-2 border-gray-200 bg-gray-100 relative"
            >
              {!loaded ? (
                <span className="absolute inset-0 flex items-center justify-center bg-gray-100">
                  <Loader2 size={20} className="text-gray-300 animate-spin" />
                </span>
              ) : !url ? (
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gray-50">
                  <FileText size={20} className="text-gray-400" />
                  <span className="text-[9px] font-black text-gray-400">MISSING</span>
                </span>
              ) : isPdf ? (
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-50">
                  <FileText size={22} className="text-red-500" />
                  <span className="text-[9px] font-black text-red-500">PDF</span>
                </span>
              ) : (
                <img src={url} className="w-full h-full object-cover" alt="" />
              )}
            </a>
            {onRemove && (
              <button
                onClick={() => onRemove(id)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow active:scale-90"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

/* file picker for photos + PDF designs */
export const FileDrop = ({ onAdd, label = 'Upload photo / design (PDF)' }: { onAdd: (id: string) => void; label?: string }) => (
  <label className="block cursor-pointer">
    <div className="border-4 border-dashed border-orange-300 bg-orange-50 rounded-2xl p-5 flex flex-col items-center gap-2 text-orange-600 active:scale-95 transition">
      <div className="flex gap-3">
        <Camera size={26} /><ImageIcon size={26} /><FileText size={26} />
      </div>
      <span className="text-xs font-black uppercase">{label}</span>
    </div>
    <input type="file" accept="image/*,application/pdf" multiple className="hidden"
      onChange={async e => {
        const input = e.target;
        const files = Array.from(input.files || []);
        input.value = '';
        for (const f of files) {
          try {
            if (f.type.startsWith('image/')) {
              const dataUrl = await new Promise<string>(res => readPhoto(f, res));
              if (!dataUrl) { alert('Could not read "' + f.name + '". Try another photo.'); continue; }
              const blob = await (await fetch(dataUrl)).blob();
              const att = await putFile(new File([blob], f.name || 'photo.jpg', { type: blob.type || 'image/jpeg' }));
              onAdd(att.id);
            } else {
              const att = await putFile(f);
              onAdd(att.id);
            }
          } catch {
            alert('Could not save "' + f.name + '". Storage may be full or blocked in this browser.');
          }
        }
      }} />
  </label>
);

/* WhatsApp pill — one URL builder (waLink) for the whole app.
   compact: inline row button (dues reminders); onOpen: hook before window.open
   (quote cards stamp status 'sent' the moment the tap lands) */
export const WhatsAppBtn = ({ phone, message, label = 'WhatsApp', disabled, compact, onOpen }: any) => {
  const ready = !!String(phone || '').replace(/\D/g, '') && !!message && !disabled;
  return (
    <button
      disabled={!ready}
      onClick={() => { if (!ready) return; if (onOpen) onOpen(); window.open(waLink(phone, message), '_blank'); }}
      className={`flex items-center justify-center font-black uppercase transition active:scale-95
        ${compact ? 'gap-1.5 py-1.5 px-3 rounded-xl text-[11px]' : 'gap-2 py-3 rounded-2xl text-sm'}
        ${ready ? 'bg-green-500 text-white shadow-lg' : 'bg-gray-100 text-gray-300'}`}
      title={ready ? 'Open WhatsApp' : 'No phone number saved yet'}
    >
      <MessageCircle size={compact ? 13 : 20} /> {label}
    </button>
  );
};

/* Excel + PDF export pair */
export const ExportRow = ({ onExcel, onPdf }: { onExcel: () => void; onPdf: () => void }) => (
  <div className="grid grid-cols-2 gap-3">
    <button onClick={onExcel} className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-700 text-white font-black uppercase text-sm active:scale-95 shadow">
      <FileSpreadsheet size={20} /> Excel
    </button>
    <button onClick={onPdf} className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-600 text-white font-black uppercase text-sm active:scale-95 shadow">
      <FileDown size={20} /> PDF
    </button>
  </div>
);

/* editable number field showing a rupee symbol.
   Keeps a string draft so the field can be cleared and retyped without
   React writing "0" back on every keystroke. */
export const MoneyField = ({ label, value, onChange }: any) => {
  const [txt, setTxt] = useState(value ? String(value) : '');
  useEffect(() => { setTxt(value ? String(value) : ''); }, [value]);
  return (
    <Field label={label}>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-600 font-black text-lg pointer-events-none">₹</span>
        <input
          className={inputCls + ' pl-9 text-green-700'}
          type="text"
          inputMode="numeric"
          value={txt}
          onFocus={e => e.target.select()}
          onChange={e => {
            const clean = e.target.value.replace(/[^\d]/g, '');
            setTxt(clean);
            const n = Number(clean);
            onChange(clean === '' ? 0 : (Number.isFinite(n) ? n : 0));
          }}
        />
      </div>
    </Field>
  );
};

/* inline edit trigger */
export const EditBtn = ({ onClick, size = 16 }: any) => (
  <button onClick={onClick} className="p-1.5 bg-wood/10 rounded-lg text-wood active:scale-90 transition" title="Edit">
    <Pencil size={size} />
  </button>
);

export const DeleteBtn = ({ onClick }: any) => (
  <button onClick={onClick} className="p-2 bg-red-50 text-red-500 rounded-xl active:scale-90 transition" title="Delete">
    <Trash2 size={16} />
  </button>
);
