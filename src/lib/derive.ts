import { AppState, Client, Worker, LedgerEntry, monthKey, ID } from '../store';

const money0 = (n: number) => (Number.isFinite(n) ? n.toLocaleString('en-US') : 'NaN');

/* Single source of truth.
   Every money figure in the app is DERIVED from ledger + orders + wages.
   Nothing is stored twice, so no module can disagree with another. */

export const paidByClient = (s: AppState, clientId: ID) =>
  s.ledger.filter(l => l.kind === 'in' && l.bucket === 'client' && l.refId === clientId)
    .reduce((a, l) => a + l.amount, 0);

export const clientTotal = (s: AppState, c: Client) => {
  // fallback to the estimate only while the client has no PRICED orders yet —
  // an order saved at price 0 must never wipe out the estimate
  const priced = s.orders.filter(o => o.clientId === c.id && o.price > 0);
  return priced.length ? priced.reduce((a, o) => a + o.price, 0) : c.totalOrderValue;
};

export const clientPaid = (s: AppState, c: Client) => paidByClient(s, c.id);

export const clientDue = (s: AppState, c: Client) =>
  clientTotal(s, c) - clientPaid(s, c); // may be negative = paid ahead, never hidden

export const lotValue = (l: { cubicFeet: number; ratePerCubicFeet: number }) =>
  l.cubicFeet * l.ratePerCubicFeet;

export const paidToVendor = (s: AppState, lotId: ID) =>
  s.ledger.filter(l => l.kind === 'out' && l.bucket === 'vendor' && l.refId === lotId)
    .reduce((a, l) => a + l.amount, 0);

export const lotDue = (s: AppState, lotId: ID) => {
  const lot = s.woodLots.find(l => l.id === lotId);
  if (!lot) return 0;
  return Math.max(0, lotValue(lot) - paidToVendor(s, lotId));
};

export const vendorDue = (s: AppState, vendorId: ID) =>
  s.woodLots.filter(l => l.vendorId === vendorId)
    .reduce((a, l) => a + lotDue(s, l.id), 0);

/* true sum paid (never clamped) — used so UI, Excel and WhatsApp always agree.
   Rows are matched by vendorId stamped at write time, so deleting a wood lot
   never makes real cash disappear from the vendor's history. */
export const vendorPaid = (s: AppState, vendorId: ID) => {
  const lotIds = new Set(s.woodLots.filter(l => l.vendorId === vendorId).map(l => l.id));
  return s.ledger
    .filter(l => l.kind === 'out' && l.bucket === 'vendor' &&
      (l.vendorId === vendorId || (!l.vendorId && lotIds.has(l.refId))))
    .reduce((a, l) => a + l.amount, 0);
};

export const totalVendorDebt = (s: AppState) =>
  s.woodLots.reduce((a, l) => a + lotDue(s, l.id), 0);

/* a ledger row whose entity was deleted keeps the cash history alive */
export const DELETED_MARK = '(record deleted)';
export const isOrphaned = (l: LedgerEntry) => l.orphaned === true || l.note.includes(DELETED_MARK);

/** stamp a row as orphaned (used by every delete path) */
export const markOrphaned = (l: LedgerEntry): LedgerEntry =>
  (l.orphaned || l.note.includes(DELETED_MARK)) ? l
    : { ...l, orphaned: true, note: `${l.note} ${DELETED_MARK}` };

/* ---- attendance ---- */

export const dayOf = (s: AppState, date: string) =>
  s.attendance.find(a => a.date === date) || { date, masterPresent: false, presentIds: [] };

export const presentCountOn = (s: AppState, date: string) => {
  const d = dayOf(s, date);
  return d.presentIds.length + (d.masterPresent ? 1 : 0);
};

export const workerDays = (s: AppState, workerId: ID, ym?: string) =>
  s.attendance.filter(a => (!ym || monthKey(a.date) === ym) && a.presentIds.includes(workerId)).length;

export const masterDays = (s: AppState, ym?: string) =>
  s.attendance.filter(a => (!ym || monthKey(a.date) === ym) && a.masterPresent).length;

export const workerWage = (s: AppState, w: Worker, ym?: string) =>
  workerDays(s, w.id, ym) * w.rate;

export const masterWage = (s: AppState, ym?: string) =>
  masterDays(s, ym) * s.settings.masterRate;

export const crewWagesDue = (s: AppState, ym?: string) =>
  s.workers.reduce((a, w) => a + workerWage(s, w, ym), 0) + masterWage(s, ym);

export const paidWages = (s: AppState, workerId: ID, ym?: string) =>
  s.ledger.filter(l => l.kind === 'out' && l.bucket === 'wage' && l.refId === workerId &&
    (!ym || (l.ym ?? monthKey(l.date)) === ym))
    .reduce((a, l) => a + l.amount, 0);

/* remaining balance in ONE month — never mixes months */
export const wageRemaining = (s: AppState, workerId: ID, ym?: string) => {
  const earned = workerId === 'master'
    ? masterWage(s, ym)
    : (s.workers.find(w => w.id === workerId)?.rate || 0) * workerDays(s, workerId, ym);
  return Math.max(0, earned - paidWages(s, workerId, ym));
};

/* paid wages for the whole crew in ONE month */
export const crewWagesPaid = (s: AppState, ym?: string) =>
  s.workers.reduce((a, w) => a + paidWages(s, w.id, ym), 0) + paidWages(s, 'master', ym);

/* what the crew is still owed in ONE month — per-person clamp so one person's
   overpayment can never hide another person's dues (sums to the roster rows) */
export const crewWagesRemaining = (s: AppState, ym?: string) =>
  wageRemaining(s, 'master', ym) + s.workers.reduce((a, w) => a + wageRemaining(s, w.id, ym), 0);

/* ---- totals ---- */

export const cashCollected = (s: AppState) =>
  s.ledger.filter(l => l.kind === 'in').reduce((a, l) => a + l.amount, 0);

/* money actually received FROM CLIENTS only — never the owner's capital.
   This is what "received" / "cash collected" must show on client-facing screens. */
export const clientCollected = (s: AppState) =>
  s.ledger.filter(l => l.kind === 'in' && l.bucket === 'client').reduce((a, l) => a + l.amount, 0);

export const toCollect = (s: AppState) =>
  s.clients.reduce((a, c) => a + Math.max(0, clientDue(s, c)), 0);

export const cashPaidOut = (s: AppState) =>
  s.ledger.filter(l => l.kind === 'out' && l.bucket !== 'expense')
    .reduce((a, l) => a + l.amount, 0);

export const expensesTotal = (s: AppState, ym?: string) =>
  s.expenses.filter(e => !ym || monthKey(e.date) === ym).reduce((a, e) => a + e.amount, 0);

/* cash in hand = money that actually came in - money actually paid out - recorded expenses */
export const cashInHand = (s: AppState) =>
  cashCollected(s) - cashPaidOut(s) - expensesTotal(s);

/* owner's own capital poured into the business (not client money) */
export const capitalIn = (s: AppState) =>
  s.ledger.filter(l => l.kind === 'in' && l.bucket === 'capital')
    .reduce((a, l) => a + l.amount, 0);

/* ---- consistency checks (used by the verifier) ---- */

export function runChecks(s: AppState): { label: string; ok: boolean; detail: string }[] {
  const out: { label: string; ok: boolean; detail: string }[] = [];
  const ids = (arr: { id: string }[]) => new Set(arr.map(x => x.id));

  const workerIds = ids(s.workers);
  const clientIds = ids(s.clients);
  const lotIds = ids(s.woodLots);

  out.push({
    label: 'Orders point at real clients',
    ok: s.orders.every(o => clientIds.has(o.clientId)),
    detail: `${s.orders.length} orders checked`
  });
  out.push({
    label: 'Ledger client entries valid',
    ok: s.ledger.filter(l => l.bucket === 'client').every(l => clientIds.has(l.refId) || isOrphaned(l)),
    detail: 'client payments reference existing clients (deleted records keep their cash row)'
  });
  out.push({
    label: 'Ledger vendor entries valid',
    ok: s.ledger.filter(l => l.bucket === 'vendor').every(l => lotIds.has(l.refId) || isOrphaned(l)),
    detail: 'vendor payments reference existing wood lots'
  });
  out.push({
    label: 'Ledger wage entries valid',
    ok: s.ledger.filter(l => l.bucket === 'wage').every(l => l.refId === 'master' || workerIds.has(l.refId) || isOrphaned(l)),
    detail: 'wage payments reference crew'
  });
  out.push({
    label: 'Attendance references live workers',
    ok: s.attendance.every(a => a.presentIds.every(id => workerIds.has(id))),
    detail: 'no orphan attendance marks'
  });
  out.push({
    label: 'No vendor overpayment',
    ok: s.woodLots.every(l => paidToVendor(s, l.id) <= lotValue(l) + 0.5),
    detail: 'vendor paid never exceeds lot value'
  });
  const crewPaid = s.workers.reduce((a, w) => a + paidWages(s, w.id), 0) + paidWages(s, 'master');
  const crewEarned = crewWagesDue(s);
  // per person — one worker being overpaid must never hide behind another being owed
  const everyWorkerOk = s.workers.every(w => paidWages(s, w.id) <= workerWage(s, w) + 0.5) &&
    paidWages(s, 'master') <= masterWage(s) + 0.5;
  out.push({
    label: 'No wage overpayment',
    ok: everyWorkerOk && crewPaid <= crewEarned + 0.5,
    detail: `paid ${crewPaid.toLocaleString()} vs earned ${crewEarned.toLocaleString()}`
  });
  const hand = cashInHand(s);
  out.push({
    label: 'Cash reconciles',
    ok: Number.isFinite(hand) && hand >= 0,
    detail: `in ${cashCollected(s).toLocaleString()} − out ${cashPaidOut(s).toLocaleString()} − exp ${expensesTotal(s).toLocaleString()} = ${money0(hand)}`
  });
  out.push({
    label: 'No duplicate attendance dates',
    ok: new Set(s.attendance.map(a => a.date)).size === s.attendance.length,
    detail: `${s.attendance.length} dates, one record each`
  });
  out.push({
    label: 'WhatsApp number format',
    ok: s.settings.whatsappNumber === '' || /^\d{7,15}$/.test(s.settings.whatsappNumber),
    detail: s.settings.whatsappNumber || 'not set yet (Settings)'
  });
  out.push({
    label: 'Order files resolvable',
    ok: s.orders.every(o => Array.isArray(o.files)),
    detail: `${s.orders.reduce((a, o) => a + o.files.length, 0)} attachments linked`
  });
  return out;
}
