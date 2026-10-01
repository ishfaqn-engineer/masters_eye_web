import { AppState, LedgerEntry, Expense, AttendanceDay, today, monthKey, monthLabel, Settings } from '../store';
import * as D from '../lib/derive';
import { money } from '../components/ui';

/* ── intents — the only vocabulary the assistant can act on ─────────── */

export type Intent =
  | { op: 'attendance'; name: string; present: boolean; date?: string }
  | { op: 'client_payment'; name?: string; amount: number }
  | { op: 'vendor_payment'; name?: string; amount: number }
  | { op: 'wage_payment'; name?: string; amount: number }
  | { op: 'expense'; label: string; amount: number }
  | { op: 'query_cash' }
  | { op: 'query_client_due'; name?: string }
  | { op: 'query_vendor_due'; name?: string }
  | { op: 'query_wages'; name?: string }
  | { op: 'query_attendance_today' }
  | { op: 'none' };

/* ── name & number helpers shared by rules and apply ────────────────── */

const norm = (s: string) =>
  s.toLowerCase().replace(/[\u0600-\u06FF]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** find the record whose name words appear in the text ("Rashid" hits "Rashid Villa") */
function matchName<T extends { name: string }>(list: T[], text: string): T | null {
  const t = ' ' + norm(text) + ' ';
  let best: T | null = null;
  let bestScore = 0;
  for (const item of list) {
    const words = norm(item.name).split(' ').filter(w => w.length > 1);
    if (!words.length) continue;
    let score = 0;
    for (const w of words) if (t.includes(' ' + w)) score++;
    if (score > bestScore) { best = item; bestScore = score; }
  }
  return best;
}

/** pull the first number out — handles 5000, 5,000, 5k, 5 hazar, 2.5k */
function extractNum(raw: string): number | null {
  const t = raw.toLowerCase();
  const m = t.match(/(\d[\d,]*\.?\d*)\s*(k|hazar|hazaar|hajar)?/);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/,/g, ''));
  if (!isFinite(n)) return null;
  if (m[2] === 'k') n *= 1000;
  else if (m[2]) n *= 1000;
  return n > 0 ? Math.round(n) : null;
}

const has = (t: string, re: RegExp) => re.test(t);

/* ── offline rule parser — works with no key, no internet ───────────── */

export function parseRules(raw: string, s: AppState): Intent | null {
  const t = ' ' + norm(raw) + ' ';
  if (!t.trim()) return null;
  const num = extractNum(raw);

  const worker = matchName(s.workers, t);
  const client = matchName(s.clients, t);
  const vendor = matchName(s.vendors, t);
  const isMaster = !!matchName([{ name: s.settings.masterName }], t);

  /* queries first — "baki/kitna" language must never fall into a payment */
  if (has(t, /\b(cash|rupee|rupya|roqba)\b/) && has(t, /\b(kitna|kinna|how much|baki|baqi|balance|total|status|check|hand|hai)\b/))
    return { op: 'query_cash' };
  if (has(t, /\b(kaun|kaun kaun|kon|who)\b/) && has(t, /\b(aaj|today)\b/))
    return { op: 'query_attendance_today' };
  if (has(t, /\b(baki|baqi|due|remaining|left|kitna|kinna|how much|kitne)\b/)) {
    if (vendor) return { op: 'query_vendor_due', name: vendor.name };
    if (client) return { op: 'query_client_due', name: client.name };
    if (worker) return { op: 'query_wages', name: worker.name };
    if (has(t, /\b(wage|wages|tankhwah|tankwa|majdoori|paga|salary)\b/)) return { op: 'query_wages' };
    if (has(t, /\b(udhar|udhaar|vendor|supplier|lakdi|dokandaar|timber)\b/)) return { op: 'query_vendor_due' };
    if (has(t, /\b(client|customer|gahak|order)\b/)) return { op: 'query_client_due' };
    return { op: 'query_cash' };
  }

  /* attendance — absence words win over the "haazir" hiding inside "gair-haazir" */
  const absent = has(t, /\b(gair|ghair|ghaer|absent|not present|na haazir|nahi haazir|nahin haazir)\b/);
  const present = has(t, /\b(haazir|hazir|present)\b/);
  if (absent && (worker || isMaster))
    return { op: 'attendance', name: worker ? worker.name : s.settings.masterName, present: false };
  if (present && (worker || isMaster))
    return { op: 'attendance', name: worker ? worker.name : s.settings.masterName, present: true };

  /* expense — kharcha style */
  if (num && has(t, /\b(kharcha|kharch|kharchay|expense|kiraya|bijli|petrol|diesel|samaan|material)\b/)) {
    let label = raw.replace(/\d[\d,]*\.?\d*\s*(k|hazar|hazaar|hajar)?/gi, ' ')
      .replace(/\b(kharcha|kharch|kharchay|expense|rs|rupees|rupya|me|ka|ki|ke|ko|di|de|hai|liya|kharida|on|for)\b/gi, ' ')
      .replace(/\s+/g, ' ').trim();
    if (label.length < 2) label = 'Expense';
    return { op: 'expense', label: label.slice(0, 60), amount: num };
  }

  if (num) {
    /* vendor settlement — "Timber Mart ko 50000 diya / pay kiya" */
    const vendorVerb = /\b(pay|paid|diya|diye|de diya|de do|bhugtan|bhugta|settle|ada|transfer|chase diya)\b/;
    if (vendor && has(t, vendorVerb)) return { op: 'vendor_payment', name: vendor.name, amount: num };
    if (!vendor && has(t, /\b(vendor|supplier|lakdi wala|dokandaar|timber)\b/) && has(t, vendorVerb) && s.vendors.length === 1)
      return { op: 'vendor_payment', name: s.vendors[0].name, amount: num };

    /* money coming IN from a client — "client ne 5000 dyut / gave 5000" */
    const inVerb = /\b(dyut|ditti|ditti|diya|diye|dya|got|received|liya|milya|mil|aaye|ayi|gayi|vasool|jama|gave|give|bheja|chase)\b/;
    if (client && has(t, inVerb)) return { op: 'client_payment', name: client.name, amount: num };
    if (!client && has(t, /\b(client|customer|gahak)\b/) && has(t, inVerb) && s.clients.length === 1)
      return { op: 'client_payment', name: s.clients[0].name, amount: num };

    /* wage payout to crew */
    const wageVerb = /\b(pay|paid|paga|wuz|wage|wages|salary|diya|diye|settle|de do|de diya)\b/;
    if (worker && has(t, wageVerb)) return { op: 'wage_payment', name: worker.name, amount: num };
    if (!worker && has(t, /\b(mazdoor|worker|crew|staff|tankhwah|wage)\b/) && has(t, wageVerb) && s.workers.length === 1)
      return { op: 'wage_payment', name: s.workers[0].name, amount: num };
  }

  /* bare cash check — "cash kinna" / "hand cash" */
  if (has(t, /\b(cash)\b/) && has(t, /\b(kitna|kinna|hai|baki|baqi)\b/)) return { op: 'query_cash' };

  return null;
}

/* ── cloud brain — same intents, free-form Kashmiri via Ollama ──────── */

const SYSTEM = `You translate a workshop owner's voice command into ONE strict JSON object.
The command may be Kashmiri (any script), Urdu, English, Hindi or mixed.
Output ONLY the JSON — no prose, no markdown, no explanations.

Possible ops:
{"op":"attendance","name":"<crew/master name>","present":true|false}
{"op":"client_payment","name":"<client name>","amount":<number>}
{"op":"vendor_payment","name":"<vendor name>","amount":<number>}
{"op":"wage_payment","name":"<crew name>","amount":<number>}
{"op":"expense","label":"<short what-it-was>","amount":<number>}
{"op":"query_cash"}
{"op":"query_client_due","name":"<client name>"}
{"op":"query_vendor_due","name":"<vendor name>"}
{"op":"query_wages","name":"<crew name>"}
{"op":"query_attendance_today"}
{"op":"none"}

Rules: amounts are plain digits (5000 not 5k). "gair-haazir"/absent => present:false.
Use the exact names from this roster when they match: __ROSTER__.
If the command is not one of these actions, answer {"op":"none"}.

Examples:
Zaid aaj gair-haazir hai => {"op":"attendance","name":"Zaid","present":false}
Rashid ne paanch hazar de diye => {"op":"client_payment","name":"Rashid Villa","amount":5000}
client gave 5000 => {"op":"client_payment","name":"Rashid Villa","amount":5000}
Timber Mart ko aaj 50000 diya => {"op":"vendor_payment","name":"Timber Mart","amount":50000}
khan ko 600 pay kar diya => {"op":"wage_payment","name":"Khan","amount":600}
bijli ka kharcha 1200 => {"op":"expense","label":"bijli","amount":1200}
cash kitna hai => {"op":"query_cash"}
Rashid kitna baki hai => {"op":"query_client_due","name":"Rashid Villa"}
Timber Mart ka udhar kitna => {"op":"query_vendor_due","name":"Timber Mart"}
aaj kaun kaun haazir tha => {"op":"query_attendance_today"}`;

function roster(s: AppState): string {
  const parts = [
    s.workers.length ? `crew: ${s.workers.map(w => w.name).join(', ')}` : '',
    s.clients.length ? `clients: ${s.clients.map(c => c.name).join(', ')}` : '',
    s.vendors.length ? `vendors: ${s.vendors.map(v => v.name).join(', ')}` : '',
    `master: ${s.settings.masterName}`,
  ].filter(Boolean);
  return parts.join('; ');
}

function cleanIntent(o: any): Intent | null {
  if (!o || typeof o !== 'object' || typeof o.op !== 'string') return null;
  switch (o.op) {
    case 'attendance':
      return typeof o.name === 'string' && typeof o.present === 'boolean'
        ? { op: 'attendance', name: o.name, present: o.present } : null;
    case 'client_payment': case 'vendor_payment': case 'wage_payment':
      return Number.isFinite(Number(o.amount)) && Number(o.amount) > 0
        ? { op: o.op, name: typeof o.name === 'string' ? o.name : undefined, amount: Math.round(Number(o.amount)) } : null;
    case 'expense':
      return Number.isFinite(Number(o.amount)) && Number(o.amount) > 0
        ? { op: 'expense', label: String(o.label || 'Expense').slice(0, 60), amount: Math.round(Number(o.amount)) } : null;
    case 'query_cash': case 'query_attendance_today':
      return { op: o.op };
    case 'query_client_due': case 'query_vendor_due': case 'query_wages':
      return { op: o.op, name: typeof o.name === 'string' ? o.name : undefined };
    case 'none':
      return { op: 'none' };
    default: return null;
  }
}

/** free-form command → intent via the configured chat model; null if no key / offline / unparseable */
export async function askBrain(raw: string, s: AppState): Promise<Intent | null> {
  const st: Settings = s.settings;
  if (!st.aiKey) return null;
  const base = (st.aiBaseUrl || 'https://ollama.com/api').replace(/\/$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(`${base}/chat`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${st.aiKey}` },
      body: JSON.stringify({
        model: st.aiModel || 'gemma4:31b',
        stream: false,
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: SYSTEM.replace('__ROSTER__', roster(s)) },
          { role: 'user', content: raw },
        ],
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const text: string = data?.message?.content ?? data?.choices?.[0]?.message?.content ?? '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    let parsed: any;
    try { parsed = JSON.parse(m[0]); } catch { return null; }
    return cleanIntent(parsed);
  } catch {
    return null; // offline / timeout — the UI falls back to a rules-only reply
  } finally {
    clearTimeout(timer);
  }
}

/* ── apply — intent + state → new state + a short Kashmiri reply ────── */

export type Applied = { state: AppState; reply: string; changed: boolean };

const replyAmbiguous = (names: string[]) => `Kon — ${names.join(', ')}? Naam thoda clear boliye.`;

function findWorker(s: AppState, name?: string) {
  if (!name) return null;
  return matchName(s.workers, name) || (norm(s.settings.masterName) === norm(name) ? ({ id: 'master', name: s.settings.masterName } as any) : null);
}

export function applyIntent(intent: Intent, s: AppState): Applied {
  const noChange = (reply: string): Applied => ({ state: s, reply, changed: false });

  switch (intent.op) {
    case 'none':
      return noChange('Maaf — eh ath meaning samjhe na. Dobara boliye.');

    case 'attendance': {
      const w = findWorker(s, intent.name);
      if (!w) return noChange(`"${intent.name}" kon? Crew list mein nahi mila.`);
      const date = intent.date || today();
      const day = s.attendance.find(a => a.date === date);
      const ids = day ? [...day.presentIds] : [];
      const was = ids.includes(w.id);
      const next = intent.present ? (was ? ids : [...ids, w.id]) : ids.filter(x => x !== w.id);
      const attendance: AttendanceDay[] = day
        ? s.attendance.map(a => a.date === date ? { ...a, presentIds: next } : a)
        : [...s.attendance, { date, masterPresent: false, presentIds: next }];
      const suffix = was === intent.present ? ' (pehle se yahi tha)' : '';
      return {
        state: { ...s, attendance },
        reply: `${w.name} — ${date === today() ? 'aaj' : date} ${intent.present ? 'haazir' : 'gair-haazir'}.${suffix}`,
        changed: was !== intent.present,
      };
    }

    case 'client_payment': {
      const c = matchName(s.clients, intent.name || '');
      if (!c && intent.name) return noChange(`"${intent.name}" client nahi mila.`);
      if (!c) return s.clients.length === 1 ? payClient(s, s.clients[0], intent.amount) : noChange(`${replyAmbiguous(s.clients.map(x => x.name))} — client kaun?`);
      return payClient(s, c, intent.amount);
    }

    case 'vendor_payment': {
      const v = matchName(s.vendors, intent.name || '');
      if (!v && intent.name) return noChange(`"${intent.name}" vendor nahi mila.`);
      if (!v) return s.vendors.length === 1 ? payVendor(s, s.vendors[0], intent.amount) : noChange(`${replyAmbiguous(s.vendors.map(x => x.name))} — vendor kaun?`);
      return payVendor(s, v, intent.amount);
    }

    case 'wage_payment': {
      const w = findWorker(s, intent.name);
      if (!w || w.id === 'master') return noChange(`"${intent.name}" crew mein nahi mila.`);
      const ym = monthKey(today());
      const due = D.wageRemaining(s, w.id, ym);
      const amt = Math.min(intent.amount, due);
      if (amt <= 0) return noChange(`${w.name} ko is mahine (${monthLabel(ym)}) kuch baki nahi.`);
      const row: LedgerEntry = {
        id: 'led' + Date.now(), kind: 'out', bucket: 'wage', refId: w.id,
        amount: amt, date: today(), ym, note: `Wage settlement ${monthLabel(ym)} · cash (assistant)`, method: 'cash',
      };
      return {
        state: { ...s, ledger: [...s.ledger, row] },
        reply: `Wandi — ${w.name} ko ₹${money(amt)} wage pay khe${amt < intent.amount ? ` (mahine ka baki ₹${money(due)} tak)` : ''}.`,
        changed: true,
      };
    }

    case 'expense': {
      const id = 'e' + Date.now() + Math.random().toString(36).slice(2, 6);
      const row: LedgerEntry = {
        id: 'led-' + id, kind: 'out', bucket: 'expense', refId: id,
        amount: intent.amount, date: today(), note: intent.label,
      };
      const exp: Expense = {
        id, label: intent.label, amount: intent.amount, category: 'consumable',
        recurring: 'none', date: today(), photo: '',
      };
      return {
        state: { ...s, expenses: [...s.expenses, exp], ledger: [...s.ledger, row] },
        reply: `Wandi — ₹${money(intent.amount)} kharch likwut: ${intent.label}.`,
        changed: true,
      };
    }

    case 'query_cash':
      return noChange(`Hand'yth cash: ₹${money(D.cashInHand(s))}. (In ₹${money(D.cashCollected(s))} − out ₹${money(D.cashPaidOut(s))} − kharch ₹${money(D.expensesTotal(s))})`);

    case 'query_client_due': {
      if (intent.name) {
        const c = matchName(s.clients, intent.name);
        if (!c) return noChange(`"${intent.name}" client nahi mila.`);
        return noChange(`${c.name} ko ab ₹${money(D.clientDue(s, c))} baki.`);
      }
      if (!s.clients.length) return noChange('Koi client nahi hai abhi.');
      return noChange(s.clients.map(c => `${c.name}: ₹${money(D.clientDue(s, c))}`).join(' · '));
    }

    case 'query_vendor_due': {
      if (intent.name) {
        const v = matchName(s.vendors, intent.name);
        if (!v) return noChange(`"${intent.name}" vendor nahi mila.`);
        return noChange(`${v.name} par ab ₹${money(D.vendorDue(s, v.id))} udhar baki.`);
      }
      return noChange(`Kul udhar: ₹${money(D.totalVendorDebt(s))}.`);
    }

    case 'query_wages': {
      const ym = monthKey(today());
      if (intent.name) {
        const w = matchName(s.workers, intent.name);
        if (!w) return noChange(`"${intent.name}" crew mein nahi mila.`);
        const rem = D.wageRemaining(s, w.id, ym);
        return noChange(`${w.name} — ${monthLabel(ym)} ka ₹${money(rem)} baki (kul wage ₹${money(D.workerWage(s, w, ym))}).`);
      }
      return noChange(`${monthLabel(ym)} wages: ₹${money(D.crewWagesRemaining(s, ym))} baki, ₹${money(D.crewWagesPaid(s, ym))} paid.`);
    }

    case 'query_attendance_today': {
      const date = today();
      const day = s.attendance.find(a => a.date === date);
      const inIds = new Set(day?.presentIds || []);
      const here = s.workers.filter(w => inIds.has(w.id)).map(w => w.name);
      const gone = s.workers.filter(w => !inIds.has(w.id)).map(w => w.name);
      if (!s.workers.length) return noChange('Crew list khali hai.');
      const parts = [`Aaj ${date}:`];
      parts.push(here.length ? `haazir — ${here.join(', ')}` : 'koi haazir nahi (abhi tak)');
      if (gone.length) parts.push(`gair-haazir — ${gone.join(', ')}`);
      return noChange(parts.join(' · '));
    }
  }
  return noChange('Kuch samjhe na.');
}

function payClient(s: AppState, c: { id: string; name: string }, amount: number): Applied {
  const row: LedgerEntry = {
    id: 'led' + Date.now(), kind: 'in', bucket: 'client', refId: c.id,
    amount, date: today(), note: 'Received (assistant)', method: 'cash',
  };
  return {
    state: { ...s, ledger: [...s.ledger, row] },
    reply: `Wandi — ${c.name} ko ₹${money(amount)} le aaye.`,
    changed: true,
  };
}

/* vendor cash is split across this vendor's oldest open lots, one row each,
   so per-lot maths and runChecks stay exact (same rule as the Money screen) */
function payVendor(s: AppState, v: { id: string; name: string }, amount: number): Applied {
  const due = D.vendorDue(s, v.id);
  let left = Math.min(amount, due);
  if (left <= 0) return { state: s, reply: `${v.name} par kuch udhar baki nahi.`, changed: false };
  const openLots = s.woodLots
    .filter(l => l.vendorId === v.id)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(l => ({ lot: l, rem: Math.max(0, D.lotValue(l) - D.paidToVendor(s, l.id)) }))
    .filter(x => x.rem > 0);
  const rows: LedgerEntry[] = [];
  const stamp = Date.now();
  for (const { lot, rem } of openLots) {
    if (left <= 0) break;
    const take = Math.min(rem, left);
    rows.push({
      id: `led${stamp}-${rows.length}`, kind: 'out', bucket: 'vendor', refId: lot.id,
      vendorId: v.id, amount: take, date: today(), note: 'Wood payment · cash (assistant)', method: 'cash',
    });
    left -= take;
  }
  if (!rows.length) return { state: s, reply: `${v.name} ke liye koi khuli lot nahi mili.`, changed: false };
  const paid = amount - left;
  return {
    state: { ...s, ledger: [...s.ledger, ...rows] },
    reply: `Wandi — ${v.name} ko ₹${money(paid)} pay khe.${left > 0 ? ` ₹${money(left)} aur baki raha.` : ''}`,
    changed: true,
  };
}

/* one entry point for the UI: rules first (instant, offline), brain second */
export async function runCommand(raw: string, s: AppState): Promise<Applied> {
  const text = raw.trim();
  if (!text) return { state: s, reply: '', changed: false };
  const rule = parseRules(text, s);
  if (rule && rule.op !== 'none') return applyIntent(rule, s);
  const brain = await askBrain(text, s);
  if (brain && brain.op !== 'none') return applyIntent(brain, s);
  if (!s.settings.aiKey) {
    return { state: s, reply: 'Maaf — rules se samjhe na. (Settings mein AI key daal do, phir aazad bolenge.)', changed: false };
  }
  return { state: s, reply: 'Maaf — eh ath samjhe na. Dobara boliye.', changed: false };
}
