import React, { useEffect, useRef, useState } from 'react';
import { Mic, Send, X, Sparkles } from 'lucide-react';
import { AppState } from '../store';
import { runCommand } from '../lib/assistant';

type Props = { state: AppState; setState: (s: AppState) => void };
type Msg = { who: 'me' | 'ai'; text: string };

const CHIPS = ['Cash kinna hai?', 'Aaj kaun haazir?', 'Timber Mart udhar kitna?'];

export default function Assistant({ state, setState }: Props) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && !msgs.length) {
      setMsgs([{
        who: 'ai',
        text: 'Boliye — jaise "Zaid aaj gair-haazir" ya "client ne 5000 dyut" ya "cash kinna hai". Simple commands offline chalte hain; Settings mein AI key ho to aazad Kashmiri bhi samajh lega.',
      }]);
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy]);

  const send = async (text?: string) => {
    const t = (text ?? draft).trim();
    if (!t || busy) return;
    setMsgs(m => [...m, { who: 'me', text: t }]);
    setDraft('');
    setHint('');
    setBusy(true);
    try {
      const res = await runCommand(t, state);
      if (res.changed) setState(res.state);
      if (res.reply) setMsgs(m => [...m, { who: 'ai', text: res.reply }]);
    } catch {
      setMsgs(m => [...m, { who: 'ai', text: 'Kuch gadbad ho gayi — dobara koshish karo.' }]);
    } finally {
      setBusy(false);
    }
  };

  const startVoice = () => {
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) { setHint('Is browser mein voice input nahi hai — type kar dein.'); return; }
    try {
      const r = new Ctor();
      // Kashmiri is rarely offered on phones — Urdu hears these short commands best
      r.lang = 'ur-IN';
      r.interimResults = false;
      r.maxAlternatives = 1;
      r.onresult = (e: any) => {
        const said = e?.results?.[0]?.[0]?.transcript || '';
        if (said) send(said);
      };
      r.onerror = () => setHint('Bolai pakari nahi — naam/amount clear bolo, ya type karo.');
      r.onend = () => setHint(h => (h === 'Sun raha hoon…' ? '' : h));
      setHint('Sun raha hoon…');
      r.start();
    } catch {
      setHint('Voice shuru nahi hua — type kar dein.');
    }
  };

  return (
    <>
      {/* FAB — same centering trick as the bottom nav */}
      <div className="fixed inset-x-0 bottom-20 z-40 mx-auto max-w-md px-4 flex justify-end pointer-events-none">
        <button
          title="Kashmiri assistant"
          onClick={() => setOpen(true)}
          className="pointer-events-auto w-14 h-14 rounded-full bg-wood text-white shadow-xl flex items-center justify-center active:scale-90 transition border-4 border-white"
        >
          <Sparkles size={24} />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-md bg-gray-50 rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: '82vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 bg-wood text-white rounded-t-3xl">
              <div className="flex items-center gap-2">
                <Sparkles size={18} />
                <div className="font-black uppercase text-sm">Kashmiri assistant</div>
              </div>
              <button title="Close assistant" onClick={() => setOpen(false)} className="p-1.5 bg-white/15 rounded-full active:scale-90">
                <X size={18} />
              </button>
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-2">
              {msgs.map((m, i) => (
                <div key={i} className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-snug whitespace-pre-wrap
                  ${m.who === 'me' ? 'ml-auto bg-wood text-white font-bold' : 'bg-white text-gray-700 font-semibold shadow'}`}>
                  {m.text}
                </div>
              ))}
              {busy && (
                <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 bg-white text-gray-400 font-bold shadow text-sm">…</div>
              )}
            </div>

            <div className="px-4 pb-2 flex gap-2 flex-wrap">
              {CHIPS.map(c => (
                <button key={c} onClick={() => setDraft(c)}
                  className="text-[11px] font-black uppercase bg-white border-2 border-gray-200 text-gray-500 px-3 py-1.5 rounded-full active:scale-95">
                  {c}
                </button>
              ))}
            </div>

            {hint && <div className="px-4 pb-1 text-[11px] font-bold text-amber-600">{hint}</div>}

            <div className="p-3 flex items-center gap-2 border-t border-gray-200 bg-white rounded-b-3xl">
              <button title="Speak" onClick={startVoice} disabled={busy}
                className="p-3 rounded-full bg-wood/10 text-wood active:scale-90 disabled:opacity-40 shrink-0">
                <Mic size={20} />
              </button>
              <input
                ref={inputRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') send(); }}
                placeholder="Likhein ya boliye…"
                className="flex-1 min-w-0"
                style={{ borderRadius: 999, border: '2px solid #e5e7eb', padding: '10px 16px', fontSize: 14, fontWeight: 600, outline: 'none' }}
              />
              <button title="Send" onClick={() => send()} disabled={busy || !draft.trim()}
                className="p-3 rounded-full bg-wood text-white active:scale-90 disabled:opacity-40 shrink-0">
                <Send size={20} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
