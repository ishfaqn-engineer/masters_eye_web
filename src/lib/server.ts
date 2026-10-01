/* The owner's Google Apps Script web app IS the server (tools/apps-script/
   Backend.gs, deployed once, /exec URL pasted into Settings). No OAuth, no
   Client ID — the URL is the endpoint, a master key guards the admin ops.
   Everything degrades: no URL configured, or the sheet offline → the app
   simply keeps working from local storage and the cached directory. */
import { AppState, Account, APP_VERSION } from '../store';
import { hashPin } from './auth';

const URL_KEY = 'masters-eye-serverurl';
const DIR_KEY = 'masters-eye-directory';
const DEV_KEY = 'masters-eye-device';
const KEY_KEY = 'masters-eye-masterkey';

export type ServerAccount = {
  id: string;
  username: string;
  name: string;
  role: string;
  pinHash: string;
  photo?: string;
  link?: string;   // JSON {vendorId,workerId,clientId} — restored onto the Account
  created?: string;
  lastSeen?: string;
};

export type ServerLog = { t: string; user: string; result: string; device: string };
export type ServerStats = {
  users: number; installs: number; devices: number;
  online: number; loginsToday: number; logins7d: number; loginsTotal: number;
};
export type UpdateInfo = { latest: string; url: string; notes: string };

export type CallResult<T = any> = {
  ok: boolean;
  error?: string;
  found?: boolean;
  data?: T;
  at?: string;
  accounts?: ServerAccount[];
  logs?: ServerLog[];
  stats?: ServerStats;
  users?: ServerAccount[];
  update?: UpdateInfo;
};

/* ── URL / identity storage ────────────────────────────────────────────── */

export const getServerUrl = (state?: AppState): string => {
  try {
    const v = localStorage.getItem(URL_KEY);
    if (v) return v;
  } catch { /* private mode */ }
  const fromState = (state?.settings?.serverUrl || '').trim();
  if (fromState) { setServerUrl(fromState); return fromState; }
  return '';
};

export const setServerUrl = (url: string): string => {
  const v = url.trim();
  try {
    if (v) localStorage.setItem(URL_KEY, v);
    else localStorage.removeItem(URL_KEY);
  } catch { /* private mode */ }
  return v;
};

export const hasServer = (state?: AppState) => !!getServerUrl(state);

export const readMasterKey = (): string => {
  try { return localStorage.getItem(KEY_KEY) || ''; } catch { return ''; }
};
export const writeMasterKey = (k: string) => {
  try { k ? localStorage.setItem(KEY_KEY, k) : localStorage.removeItem(KEY_KEY); } catch { /* ignore */ }
};

/** one stable id per install — feeds op=install / op=heartbeat */
export const deviceId = (): string => {
  try {
    let v = localStorage.getItem(DEV_KEY);
    if (!v) {
      v = (globalThis.crypto?.randomUUID?.() || `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
      localStorage.setItem(DEV_KEY, v);
    }
    return v;
  } catch {
    return `dev-${Date.now()}`;
  }
};

export const deviceName = (): string => {
  const ua = navigator.userAgent || '';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : 'Web';
  const model = (ua.match(/;\s([^;)]+)\s(?:Build|\))/) || [])[1];
  return [os, model].filter(Boolean).join(' ').slice(0, 40) || os;
};

/* ── wire ──────────────────────────────────────────────────────────────── */

const TIMEOUT = 15000;

async function rawFetch(url: string, init: RequestInit): Promise<CallResult> {
  const res = await fetch(url, { ...init, redirect: 'follow' });
  const txt = await res.text();
  try { return JSON.parse(txt); }
  catch { throw new Error('Server sent something that is not the Master\'s Eye API (check the link).'); }
}

/**
 * POST with text/plain on purpose: application/json makes the browser send an
 * OPTIONS preflight, which Apps Script web apps cannot answer. If the POST is
 * blocked anyway (CORS quirks), one GET retry carries the same payload in the
 * query string — doGet() in Backend.gs dispatches it identically.
 */
export async function call<T = any>(payload: Record<string, any>): Promise<CallResult<T>> {
  const url = getServerUrl();
  if (!url) return { ok: false, error: 'No server link yet — paste your /exec link in Settings.' };
  try {
    return await rawFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch {
    try {
      return await rawFetch(`${url}?p=${encodeURIComponent(JSON.stringify(payload))}`, {
        signal: AbortSignal.timeout(TIMEOUT),
      });
    } catch (e: any) {
      const msg = /timeout|aborted/i.test(String(e?.message))
        ? 'Server did not answer in time — check your internet.'
        : String(e?.message || e);
      return { ok: false, error: msg };
    }
  }
}

/* ── directory cache (offline login) ───────────────────────────────────── */

export const readDirectory = (): ServerAccount[] => {
  try { return JSON.parse(localStorage.getItem(DIR_KEY) || '[]'); } catch { return []; }
};

export const writeDirectory = (list: ServerAccount[]) => {
  try { localStorage.setItem(DIR_KEY, JSON.stringify(list)); } catch { /* ignore */ }
};

export const toAccount = (a: ServerAccount): Account => {
  let link: any = {};
  try { link = a.link ? JSON.parse(a.link) : {}; } catch { /* ignore */ }
  return {
    id: a.id,
    name: a.name,
    role: (a.role || 'user') as Account['role'],
    pinHash: a.pinHash,
    username: a.username,
    photo: a.photo || '',
    vendorId: link.vendorId,
    workerId: link.workerId,
    clientId: link.clientId,
  };
};

export const normUser = (u: string) => u.trim().toLowerCase();

export const validUser = (u: string) => /^[a-z0-9._-]{3,24}$/.test(normUser(u));

/* ── ops ───────────────────────────────────────────────────────────────── */

export async function syncDirectory(): Promise<CallResult> {
  const res = await call({ op: 'directory' });
  if (res.ok && Array.isArray(res.accounts)) writeDirectory(res.accounts);
  return res;
}

/** register a public signup (role 'user') — hash never leaves the device raw */
export async function registerAccount(input: {
  username: string; name: string; password: string; role?: string;
  photo?: string; link?: string; masterKey?: string;
}): Promise<CallResult> {
  const username = normUser(input.username);
  const pinHash = await hashPin(input.password, username);
  const res = await call({
    op: 'register', username, name: input.name.trim(), role: input.role || 'user',
    pinHash, photo: input.photo || '', link: input.link || '',
    masterKey: input.masterKey || '',
  });
  if (res.ok) await syncDirectory();
  return res;
}

/** username + password against the live directory, cached copy offline */
export async function loginWithPassword(input: { username: string; password: string; allowOffline?: boolean })
  : Promise<CallResult & { account?: Account }> {
  const username = normUser(input.username);
  let list = readDirectory();
  const live = await syncDirectory();
  if (live.ok && Array.isArray(live.accounts)) list = live.accounts;

  const row = list.find(a => normUser(a.username) === username);
  if (!row) {
    return live.ok
      ? { ok: false, error: 'No such username on this server.' }
      : { ok: false, error: 'Server unreachable and this username is not cached on this device.' };
  }
  const pinHash = await hashPin(input.password, username);
  if (pinHash !== row.pinHash) {
    // still log the failed attempt so the master console sees it
    await call({ op: 'login', username, pinHash, deviceId: deviceId(), deviceName: deviceName(), ok: 0 });
    return { ok: false, error: 'Wrong password.' };
  }
  const res = await call({
    op: 'login', username, pinHash, deviceId: deviceId(), deviceName: deviceName(), ok: 1,
  });
  if (!res.ok && !input.allowOffline) return { ok: false, error: res.error || 'Server rejected the login.' };
  return { ok: true, account: toAccount(row), data: res.data };
}

export async function heartbeat(username: string): Promise<CallResult> {
  return call({ op: 'heartbeat', username, deviceId: deviceId(), deviceName: deviceName(), appVersion: APP_VERSION });
}

export async function installPing(appVersion: string): Promise<CallResult> {
  return call({ op: 'install', deviceId: deviceId(), deviceName: deviceName(), appVersion });
}

/* ── backups (state JSON → a Drive file owned by the script) ───────────── */

const slim = (obj: any): any => {
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

const CHUNK = 300000;

/** photos stripped, then uploaded whole (or in parts for very big shops) */
export async function backupState(username: string, state: AppState): Promise<CallResult> {
  const payload = JSON.stringify({ ...slim(state), exportedAt: new Date().toISOString() });
  if (payload.length <= CHUNK) {
    return call({ op: 'backup', username: normUser(username), data: payload });
  }
  const total = Math.ceil(payload.length / CHUNK);
  for (let i = 0; i < total; i++) {
    const part = payload.slice(i * CHUNK, (i + 1) * CHUNK);
    const res = await call({ op: 'backuppart', username: normUser(username), idx: i, total, part });
    if (!res.ok) return res;
  }
  return call({ op: 'backupend', username: normUser(username), total });
}

export async function restoreState(username: string): Promise<CallResult> {
  return call({ op: 'restore', username: normUser(username) });
}

/* ── master console ────────────────────────────────────────────────────── */

export const fetchLogs = (masterKey: string, limit = 100) => call({ op: 'logs', masterKey, limit });
export const fetchStats = (masterKey: string) => call({ op: 'stats', masterKey });
export const fetchUsers = (masterKey: string) => call({ op: 'users', masterKey });

export async function resetPassword(masterKey: string, username: string, newPassword: string): Promise<CallResult> {
  const pinHash = await hashPin(newPassword, normUser(username));
  return call({ op: 'reset', masterKey, username: normUser(username), pinHash });
}

export const checkUpdate = (versionCode: number) => call({ op: 'update', version: versionCode });
export const setUpdate = (masterKey: string, latest: string, code: number, url: string, notes: string) =>
  call({ op: 'setupdate', masterKey, latest, code, url, notes });
export const ping = () => call({ op: 'ping' });

/** self-service password change: proves the old hash, stores the new one */
export async function changePassword(username: string, oldPassword: string, newPassword: string): Promise<CallResult> {
  const u = normUser(username);
  const oldPinHash = await hashPin(oldPassword, u);
  const newPinHash = await hashPin(newPassword, u);
  return call({ op: 'setpass', username: u, oldPinHash, newPinHash });
}
