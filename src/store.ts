export type ID = string;

import { saveBlob } from './lib/native';

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
};

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
  note: string;
  /** for wage rows: which month this payment settles (defaults to date's month) */
  ym?: string;
  /** set when the client/lot/worker this row was for gets deleted — cash history stays alive */
  orphaned?: boolean;
  /** vendor rows keep their vendor even after the wood lot is deleted */
  vendorId?: string;
};

export type Settings = {
  masterName: string;
  masterPhoto: string;
  masterRate: number;
  whatsappNumber: string; // international, digits only, e.g. 923001234567
  currency: string;
  /** OAuth client id from Google Cloud Console — enables Drive sync (optional) */
  googleClientId: string;
};

export type Role = 'master' | 'vendor' | 'team';

export type Account = {
  id: ID;
  name: string;
  role: Role;
  /** SHA-256(pin + id) — never the PIN itself */
  pinHash: string;
  /** for role 'vendor': which vendor this login represents */
  vendorId?: ID;
  /** for role 'team': which worker this login represents */
  workerId?: ID;
  photo?: string;
};

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
      googleClientId: ''
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
      { id: 'o1', clientId: 'c1', kind: 'door', qty: 6, widthIn: 36, heightIn: 84, woodType: 'Teak', price: 48000, status: 'cutting', notes: '', files: [] },
      { id: 'o2', clientId: 'c1', kind: 'window', qty: 4, widthIn: 48, heightIn: 60, woodType: 'Sheesham', price: 24000, status: 'pending', notes: '', files: [] },
      { id: 'o3', clientId: 'c2', kind: 'door', qty: 2, widthIn: 32, heightIn: 80, woodType: 'Oak', price: 18000, status: 'polish', notes: '', files: [] },
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
        .map((l: any) => ({ ...l, amount: Number(l.amount) }))
    : [];
  return {
    ...base,
    ...parsed,
    v: 2,
    settings: { ...base.settings, ...(parsed?.settings || {}) },
    accounts: Array.isArray(parsed?.accounts) ? parsed.accounts : base.accounts,
    workers: Array.isArray(parsed?.workers) ? parsed.workers : [],
    attendance,
    clients: Array.isArray(parsed?.clients) ? parsed.clients : [],
    vendors: Array.isArray(parsed?.vendors) ? parsed.vendors : [],
    woodLots: Array.isArray(parsed?.woodLots) ? parsed.woodLots : [],
    orders: Array.isArray(parsed?.orders) ? parsed.orders : [],
    expenses: Array.isArray(parsed?.expenses) ? parsed.expenses : [],
    ledger,
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
      googleClientId: ''
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
          c[k] = typeof v === 'string' && v.startsWith('data:') && k.toLowerCase().includes('photo') ? '' : walk(v);
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
    // last resort: drop only the biggest photo strings so history, money and
    // attendance still survive. In-memory state is untouched, but tell the owner.
    try {
      localStorage.setItem(KEY, JSON.stringify(slimPhotos(s)));
      if (!warnedPhotoStrip) {
        warnedPhotoStrip = true;
        alert('Phone storage is full. Old photos were skipped so your records stay safe — use Backup now to save everything to a file.');
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
