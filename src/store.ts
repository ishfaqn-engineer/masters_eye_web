export type ID = string;

import { saveBlob } from './lib/native';

/* shipped build identity — the update check compares these against the
   server manifest (op=update) */
export const APP_VERSION = '2.2.0';
export const APP_CODE = 22;

export type Worker = { id: ID; name: string; photo: string; rate: number; phone?: string };

export type AttendanceDay = {
  date: string; // YYYY-MM-DD
  masterPresent: boolean;
  presentIds: ID[];
};

export type Client = {
  id: ID;
  name: string;
  photo: string;
  phone: string;
  notes: string;
  totalOrderValue: number; // estimate used only while no priced orders exist
};

export type Vendor = { id: ID; name: string; phone: string; photo: string };

export type WoodLot = {
  id: ID;
  type: string;
  cubicFeet: number;
  ratePerCubicFeet: number;
  vendorId: ID;
  photo: string;
  date: string;
};

export type OrderStatus = 'pending' | 'cutting' | 'polish' | 'installed' | 'delivered';

/** one row of the order spec sheet — e.g. "6× Main door 36×84, 4 cft wood" */
export type SpecLine = {
  id: ID;
  label: string;
  qty: number;
  widthIn: number;
  heightIn: number;
  woodCft: number; // wood required for this whole line (qty included)
};

/** structured order details: doors, windows of different sizes, named "other"
    categories — plus the client's uploaded design images (data-URLs, so they
    travel with Drive sync and file backup) */
export type OrderSpecs = {
  doors: SpecLine[];
  windows: SpecLine[];
  others: SpecLine[];
  designs: string[];
};

export type OrderItem = {
  id: ID;
  clientId: ID;
  kind: 'door' | 'window' | 'other';
  qty: number;
  widthIn: number;
  heightIn: number;
  woodType: string;
  price: number;
  status: OrderStatus;
  notes: string;
  files: ID[]; // attachment ids in IndexedDB (images + pdf)
  /** structured doors/windows/others breakdown — added in v2.1 */
  specs?: OrderSpecs;
};

export const allSpecLines = (specs?: OrderSpecs): SpecLine[] =>
  specs ? [...specs.doors, ...specs.windows, ...specs.others] : [];

export const specWoodTotal = (specs?: OrderSpecs): number =>
  allSpecLines(specs).reduce((a, l) => a + (Number(l.woodCft) || 0), 0);

/** collapse the spec sheet into the legacy flat fields (exports + card header) */
export function specsToFlat(specs: OrderSpecs): { kind: 'door' | 'window' | 'other'; qty: number; widthIn: number; heightIn: number } {
  const first = specs.doors[0] || specs.windows[0] || specs.others[0];
  return {
    kind: specs.doors.length ? 'door' : specs.windows.length ? 'window' : 'other',
    qty: Math.max(1, allSpecLines(specs).reduce((a, l) => a + (Number(l.qty) || 0), 0)),
    widthIn: Math.max(1, Number(first?.widthIn) || 36),
    heightIn: Math.max(1, Number(first?.heightIn) || 84),
  };
}

export type OrderLine = { label: string; qty: number; widthIn: number; heightIn: number };

/**
 * one display row per spec line — cards, Excel, PDF and WhatsApp all read the
 * sheet instead of the collapsed flat fields, so a 3-door + 2-window order
 * never shows up as "5× door, 36×84".
 * Orders saved before v2.1 (no specs) keep their single legacy row.
 */
export function orderLines(o: Pick<OrderItem, 'kind' | 'qty' | 'widthIn' | 'heightIn' | 'specs'>): OrderLine[] {
  const s = o.specs;
  const sec = (ls: SpecLine[], fallback: string): OrderLine[] => ls.map(l => ({
    label: l.label || fallback,
    qty: Math.max(1, Number(l.qty) || 1),
    widthIn: Number(l.widthIn) || o.widthIn,
    heightIn: Number(l.heightIn) || o.heightIn,
  }));
  if (s && (s.doors.length || s.windows.length || s.others.length)) {
    return [...sec(s.doors, 'Door'), ...sec(s.windows, 'Window'), ...sec(s.others, 'Item')];
  }
  return [{ label: o.kind, qty: Math.max(1, o.qty || 1), widthIn: o.widthIn, heightIn: o.heightIn }];
}

/** card header: total pieces + item kinds + distinct sizes (max 2 shown, then "+n") */
export function orderHeadline(o: Pick<OrderItem, 'kind' | 'qty' | 'widthIn' | 'heightIn' | 'specs'>): { qty: number; kind: string; sizes: string } {
  const s = o.specs;
  const hasSpecs = !!s && (s.doors.length || s.windows.length || s.others.length);
  if (!hasSpecs) return { qty: Math.max(1, o.qty || 1), kind: o.kind, sizes: `${o.widthIn}"×${o.heightIn}"` };
  const lines = orderLines(o);
  const kinds: string[] = [];
  if (s!.doors.length) kinds.push(s!.doors.length === 1 ? 'door' : 'doors');
  if (s!.windows.length) kinds.push(s!.windows.length === 1 ? 'window' : 'windows');
  if (s!.others.length) kinds.push(s!.others.length === 1 ? 'item' : 'items');
  const sizes = [...new Set(lines.map(l => `${l.widthIn}"×${l.heightIn}"`))];
  return {
    qty: lines.reduce((a, l) => a + l.qty, 0),
    kind: kinds.join('+'),
    sizes: sizes.slice(0, 2).join(', ') + (sizes.length > 2 ? ` +${sizes.length - 2}` : ''),
  };
}

/** give a legacy order (or a brand-new blank) a starting spec sheet */
export function seedSpecs(o: Pick<OrderItem, 'kind' | 'qty' | 'widthIn' | 'heightIn'>): OrderSpecs {
  const label = o.kind === 'door' ? 'Door' : o.kind === 'window' ? 'Window' : 'Item';
  const line: SpecLine = { id: 'sl' + Date.now() + Math.random().toString(36).slice(2, 5), label, qty: Math.max(1, o.qty || 1), widthIn: o.widthIn || 36, heightIn: o.heightIn || 84, woodCft: 0 };
  return { doors: o.kind === 'door' ? [line] : [], windows: o.kind === 'window' ? [line] : [], others: o.kind === 'other' ? [line] : [], designs: [] };
}

export type Expense = {
  id: ID;
  label: string;
  amount: number;
  category: 'consumable' | 'asset' | 'daily' | 'yearly';
  recurring: 'none' | 'daily' | 'monthly' | 'yearly';
  date: string;
  photo: string;
};

export type LedgerEntry = {
  id: ID;
  kind: 'in' | 'out';
  bucket: 'client' | 'vendor' | 'wage' | 'expense' | 'capital';
  refId: ID;
  amount: number;
  date: string;
  /** immutable time this transaction was actually recorded */
  timestamp?: string;
  note: string;
  /** for wage rows: which month this payment settles (defaults to date's month) */
  ym?: string;
  /** set when the client/lot/worker this row was for gets deleted — cash history stays alive */
  orphaned?: boolean;
  /** vendor rows keep their vendor even after the wood lot is deleted */
  vendorId?: string;
  /** how a payment was handed over: cash in hand or online transfer */
  method?: 'cash' | 'online';
};

export type Settings = {
  masterName: string;
  masterPhoto: string;
  masterRate: number;
  whatsappNumber: string; // international, digits only, e.g. 923001234567
  currency: string;
  /** the owner's Apps Script /exec URL — the app's "server" (accounts, logs,
      backups). Empty = fully local, everything still works. */
  serverUrl: string;
  /** where "Forgot password?" sends people — set once by the master */
  supportEmail: string;
};

export type Role = 'master' | 'vendor' | 'team' | 'client' | 'user';

export type Account = {
  id: ID;
  name: string;
  role: Role;
  /** SHA-256(pin + id) — never the PIN itself */
  pinHash: string;
  /** public sign-up handle (role 'user', and any account registered on the
      server) — login looks it up in the server directory, then falls back to
      the cached copy offline */
  username?: string;
  /** for role 'vendor': which vendor this login represents */
  vendorId?: ID;
  /** for role 'team': which worker this login represents */
  workerId?: ID;
  /** for role 'client': which client this login represents */
  clientId?: ID;
  photo?: string;
};

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined';

export type QuoteItem = { id: ID; desc: string; qty: number; rate: number };

/** price estimate sent before any work starts — "Accept" stamps orderId and
    turns it into a real pending order, so a quote is never retyped */
export type Quote = {
  id: ID;
  clientId: ID;
  date: string;
  items: QuoteItem[];
  discount: number;
  note: string;
  validDays: number;
  status: QuoteStatus;
  orderId?: ID;
};

export const quoteTotal = (q: Pick<Quote, 'items' | 'discount'>) =>
  Math.max(0, q.items.reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0) - (Number(q.discount) || 0));

export type AppState = {
  v: 2;
  settings: Settings;
  accounts: Account[];
  workers: Worker[];
  attendance: AttendanceDay[];
  clients: Client[];
  vendors: Vendor[];
  woodLots: WoodLot[];
  orders: OrderItem[];
  expenses: Expense[];
  ledger: LedgerEntry[];
  quotes: Quote[];
  lastSync: string | null;
};

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const monthKey = (date: string) => date.slice(0, 7);

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' });
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const KEY = 'masters-eye-v2';

export function emptyState(): AppState {
  const t = today();
  return {
    v: 2,
    settings: {
      masterName: 'Master',
      masterPhoto: 'https://i.pravatar.cc/300?u=master',
      masterRate: 2000,
      whatsappNumber: '',
      currency: 'Rs',
      serverUrl: '',
      supportEmail: ''
    },
    accounts: [],
    workers: [
      { id: 'w1', name: 'Ali', photo: 'https://i.pravatar.cc/150?u=ali', rate: 1500, phone: '03001112223' },
      { id: 'w2', name: 'Khan', photo: 'https://i.pravatar.cc/150?u=khan', rate: 1200, phone: '03112223334' },
      { id: 'w3', name: 'Zaid', photo: 'https://i.pravatar.cc/150?u=zaid', rate: 1500, phone: '03334445557' },
    ],
    attendance: [],
    clients: [
      { id: 'c1', name: 'Rashid Villa', photo: 'https://i.pravatar.cc/300?u=rashid', phone: '03001234567', notes: 'Main door + 4 windows', totalOrderValue: 85000 },
      { id: 'c2', name: 'Sara Apartments', photo: 'https://i.pravatar.cc/300?u=sara', phone: '03117654321', notes: '', totalOrderValue: 40000 },
    ],
    vendors: [
      { id: 'v1', name: 'Timber Mart', phone: '03221112223', photo: 'https://i.pravatar.cc/150?u=timber' },
      { id: 'v2', name: 'Forest Co.', phone: '03334445556', photo: 'https://i.pravatar.cc/150?u=forest' },
    ],
    woodLots: [
      { id: 'l1', type: 'Teak', cubicFeet: 450, ratePerCubicFeet: 3200, vendorId: 'v1', photo: '', date: t },
      { id: 'l2', type: 'Sheesham', cubicFeet: 120, ratePerCubicFeet: 2400, vendorId: 'v2', photo: '', date: t },
      { id: 'l3', type: 'Oak', cubicFeet: 85, ratePerCubicFeet: 1900, vendorId: 'v1', photo: '', date: t },
    ],
    orders: [
      {
        id: 'o1', clientId: 'c1', kind: 'door', qty: 6, widthIn: 36, heightIn: 84, woodType: 'Teak', price: 48000, status: 'cutting', notes: '', files: [],
        specs: { doors: [{ id: 'sl1', label: 'Main door', qty: 6, widthIn: 36, heightIn: 84, woodCft: 9 }], windows: [], others: [], designs: [] }
      },
      {
        id: 'o2', clientId: 'c1', kind: 'window', qty: 4, widthIn: 48, heightIn: 60, woodType: 'Sheesham', price: 24000, status: 'pending', notes: '', files: [],
        specs: { doors: [], windows: [{ id: 'sl2', label: 'Sliding window', qty: 4, widthIn: 48, heightIn: 60, woodCft: 4.5 }], others: [], designs: [] }
      },
      {
        id: 'o3', clientId: 'c2', kind: 'door', qty: 2, widthIn: 32, heightIn: 80, woodType: 'Oak', price: 18000, status: 'polish', notes: '', files: [],
        specs: { doors: [{ id: 'sl3', label: 'Kitchen door', qty: 2, widthIn: 32, heightIn: 80, woodCft: 2.5 }], windows: [], others: [], designs: [] }
      },
    ],
    expenses: [
      { id: 'e1', label: 'Sanding belts', amount: 2500, category: 'consumable', recurring: 'monthly', date: t, photo: '' },
      { id: 'e2', label: 'Machine oil', amount: 1200, category: 'daily', recurring: 'daily', date: t, photo: '' },
      { id: 'e3', label: 'CNC blade', amount: 32000, category: 'asset', recurring: 'yearly', date: t, photo: '' },
    ],
    ledger: [
      { id: 'led0', kind: 'in', bucket: 'capital', refId: 'master', amount: 400000, date: t, note: 'Opening capital / own money' },
      { id: 'led1', kind: 'in', bucket: 'client', refId: 'c1', amount: 20000, date: t, note: 'Advance' },
      { id: 'led2', kind: 'in', bucket: 'client', refId: 'c2', amount: 10000, date: t, note: 'Advance' },
      { id: 'led3', kind: 'out', bucket: 'vendor', refId: 'l2', amount: 150000, date: t, note: 'Part payment' },
      { id: 'led4', kind: 'out', bucket: 'vendor', refId: 'l3', amount: 161500, date: t, note: 'Full payment' },
    ],
    quotes: [],
    lastSync: null,
  };
}

/* merge any parsed payload onto the base shape — shared by boot & file restore.
   Pass blankState() as base when restoring, so missing keys never re-seed demo data. */
export function normalizeState(parsed: any, base: AppState = emptyState()): AppState {
  // shape-guard the two collections whose malformed rows crash live screens
  const attendance = Array.isArray(parsed?.attendance)
    ? parsed.attendance
        .filter((a: any) => a && typeof a.date === 'string')
        .map((a: any) => ({
          ...a,
          presentIds: Array.isArray(a.presentIds) ? a.presentIds.filter((x: any) => typeof x === 'string') : [],
          masterPresent: !!a.masterPresent,
        }))
    : [];
  const ledger = Array.isArray(parsed?.ledger)
    ? parsed.ledger
        .filter((l: any) => l && typeof l.id === 'string' && Number.isFinite(Number(l.amount)))
        .map((l: any) => ({ ...l, amount: Number(l.amount), timestamp: typeof l.timestamp === 'string' ? l.timestamp : undefined }))
    : [];
  // orders: keep only rows with real ids; coerce a malformed spec sheet instead
  // of letting one bad line crash the Orders and Clients screens
  const fixLines = (a: any): SpecLine[] => Array.isArray(a)
    ? a.filter((l: any) => l && typeof l === 'object')
        .map((l: any, i: number) => ({
          id: typeof l.id === 'string' ? l.id : 'sl' + i + Math.random().toString(36).slice(2, 6),
          label: typeof l.label === 'string' ? l.label : '',
          qty: Math.max(0, Number(l.qty) || 0),
          widthIn: Math.max(0, Number(l.widthIn) || 0),
          heightIn: Math.max(0, Number(l.heightIn) || 0),
          woodCft: Math.max(0, Number(l.woodCft) || 0),
        }))
    : [];
  const fixSpecs = (o: any): OrderSpecs | undefined => {
    if (!o?.specs || typeof o.specs !== 'object') return undefined;
    return {
      doors: fixLines(o.specs.doors),
      windows: fixLines(o.specs.windows),
      others: fixLines(o.specs.others),
      designs: Array.isArray(o.specs.designs) ? o.specs.designs.filter((d: any) => typeof d === 'string' && d) : [],
    };
  };
  const orders = Array.isArray(parsed?.orders)
    ? parsed.orders
        .filter((o: any) => o && typeof o.id === 'string' && typeof o.clientId === 'string')
        .map((o: any) => ({ ...o, files: Array.isArray(o.files) ? o.files : [], specs: fixSpecs(o) }))
    : [];
  const STATUSES = ['draft', 'sent', 'accepted', 'declined'];
  const quotes = Array.isArray(parsed?.quotes)
    ? parsed.quotes
        .filter((q: any) => q && typeof q.id === 'string' && Array.isArray(q.items))
        .map((q: any) => ({
          ...q,
          clientId: typeof q.clientId === 'string' ? q.clientId : '',
          date: typeof q.date === 'string' ? q.date : '',
          items: q.items
            .filter((i: any) => i && typeof i === 'object')
            .map((i: any, k: number) => ({
              id: typeof i.id === 'string' ? i.id : 'qi' + k + Math.random().toString(36).slice(2, 6),
              desc: typeof i.desc === 'string' ? i.desc : '',
              qty: Math.max(0, Number(i.qty) || 0),
              rate: Math.max(0, Number(i.rate) || 0),
            })),
          discount: Math.max(0, Number(q.discount) || 0),
          validDays: Math.max(1, Number(q.validDays) || 7),
          status: STATUSES.includes(q.status) ? q.status : 'draft',
        }))
    : [];
  // drop the legacy OAuth / AI settings — v2.0.0 removed both flows
  const { googleClientId: _g, aiBaseUrl: _b, aiKey: _k, aiModel: _m, ...restSettings } = (parsed?.settings || {}) as any;
  return {
    ...base,
    ...parsed,
    v: 2,
    settings: { ...base.settings, ...restSettings },
    accounts: Array.isArray(parsed?.accounts) ? parsed.accounts : base.accounts,
    workers: Array.isArray(parsed?.workers) ? parsed.workers : [],
    attendance,
    clients: Array.isArray(parsed?.clients) ? parsed.clients : [],
    vendors: Array.isArray(parsed?.vendors) ? parsed.vendors : [],
    woodLots: Array.isArray(parsed?.woodLots) ? parsed.woodLots : [],
    expenses: Array.isArray(parsed?.expenses) ? parsed.expenses : [],
    ledger,
    orders,
    quotes,
  } as AppState;
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    // a fresh install starts empty — never ship demo records
    if (!raw) return blankState();
    const parsed = JSON.parse(raw);
    if (parsed?.v !== 2) return blankState();
    return normalizeState(parsed, blankState());
  } catch {
    // keep the damaged payload instead of silently destroying it —
    // the next boot starts fresh but the bytes survive for recovery
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) localStorage.setItem(KEY + ':corrupt', raw);
      console.warn('Master\'s Eye: stored data was unreadable; a copy was kept at', KEY + ':corrupt');
    } catch { /* storage itself is unavailable */ }
    return blankState();
  }
}

/* truly empty state — used by "Reset all data" so a reset never re-seeds
   the demo crew, clients, stock or capital */
export function blankState(): AppState {
  return {
    v: 2,
    settings: {
      masterName: 'Master',
      masterPhoto: '',
      masterRate: 0,
      whatsappNumber: '',
      currency: 'Rs',
      serverUrl: '',
      supportEmail: ''
    },
    accounts: [],
    workers: [],
    attendance: [],
    clients: [],
    vendors: [],
    woodLots: [],
    orders: [],
    expenses: [],
    ledger: [],
    quotes: [],
    lastSync: null,
  };
}

let warnedPhotoStrip = false;
let warnedStorageBlock = false;
export function saveState(s: AppState) {
  const slimPhotos = (obj: any) => {
    const walk = (o: any): any => {
      if (Array.isArray(o)) return o.map(walk);
      if (o && typeof o === 'object') {
        const c: any = Array.isArray(o) ? [] : {};
        for (const [k, v] of Object.entries(o)) {
          const heavy = k === 'designs' || k.toLowerCase().includes('photo');
          if (heavy && typeof v === 'string' && v.startsWith('data:')) c[k] = '';
          else if (heavy && Array.isArray(v)) c[k] = v.filter((x: any) => !(typeof x === 'string' && x.startsWith('data:')));
          else c[k] = walk(v);
        }
        return c;
      }
      return o;
    };
    return walk(obj);
  };

  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // last resort: drop only the biggest photo & design strings so history,
    // money and attendance still survive. In-memory state is untouched, but tell the owner.
    try {
      localStorage.setItem(KEY, JSON.stringify(slimPhotos(s)));
      if (!warnedPhotoStrip) {
        warnedPhotoStrip = true;
        alert('Phone storage is full. Old photos and design images were skipped so your records stay safe — use Backup now to save everything to a file.');
      }
    } catch {
      if (!warnedStorageBlock) {
        warnedStorageBlock = true;
        alert('This browser is blocking storage. Use Backup now to download your records before closing.');
      }
    }
  }
}

export async function syncToDrive(state: AppState): Promise<{ ok: boolean; at: string }> {
  const at = new Date().toISOString();
  const name = `masters-eye-backup-${today()}.json`; // local date, not UTC
  try {
    const handle = await (window as any).showSaveFilePicker?.({
      suggestedName: name,
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
    if (handle) {
      const ws = await handle.createWritable();
      await ws.write(JSON.stringify(state, null, 2));
      await ws.close();
      return { ok: true, at };
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') return { ok: false, at };
  }
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  if (await saveBlob(blob, name)) return { ok: true, at };
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { ok: true, at };
}
