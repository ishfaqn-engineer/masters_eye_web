/* Google Drive sync via Google Identity Services + Drive REST API v3.
   Files live in the app's private appDataFolder — they never clutter My Drive.
   Requires a one-time OAuth Client ID (Settings → Google Drive).
   Falls back gracefully: any failure surfaces as { ok:false, error } and the
   file-based backup keeps working. */

declare global {
  interface Window { google?: any }
}

let accessToken: string | null = null;
let tokenPromise: Promise<string> | null = null;
let gisLoaded: Promise<void> | null = null;

/* set once the owner has granted Drive access on THIS install — lets the app
   silently resume its cloud session on later boots, and tells the first-run
   screen when a background restore attempt is even possible (a fresh install
   never has this flag: consent died with the old app data, so the owner gets
   one clear "Sign in with Google" tap instead of a mystery popup). */
const GF_KEY = 'masters-eye-gdrive';
export const everConnected = () => {
  try { return localStorage.getItem(GF_KEY) === '1'; } catch { return false; }
};
const markConnected = () => { try { localStorage.setItem(GF_KEY, '1'); } catch { /* private mode */ } };
const clearConnected = () => { try { localStorage.removeItem(GF_KEY); } catch { /* private mode */ } };

function loadGis(): Promise<void> {
  if (!gisLoaded) {
    gisLoaded = new Promise((res, rej) => {
      if (window.google?.accounts?.oauth2) { res(); return; }
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => res();
      s.onerror = () => rej(new Error('Could not load Google sign-in script (network blocked?)'));
      document.head.appendChild(s);
    });
  }
  return gisLoaded;
}

export async function connectGoogle(clientId: string): Promise<string> {
  if (!clientId.trim()) throw new Error('No Google Client ID set — add one in Settings first.');
  if (accessToken) return accessToken; // already authorised — no popup on every backup
  await loadGis();
  if (tokenPromise) return tokenPromise;
  tokenPromise = new Promise<string>((res, rej) => {
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId.trim(),
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (resp: any) => {
          tokenPromise = null;
          if (resp?.error || !resp?.access_token) {
            rej(new Error(resp?.error_description || resp?.error || 'Google sign-in was cancelled.'));
            return;
          }
          accessToken = String(resp.access_token);
          markConnected();
          res(accessToken);
        },
        error_callback: (err: any) => {
          tokenPromise = null;
          rej(new Error(err?.message || 'Google sign-in was closed.'));
        },
      });
      client.requestAccessToken();
    } catch (e: any) {
      tokenPromise = null;
      rej(e);
    }
  });
  return tokenPromise;
}

export const isConnected = () => !!accessToken;

/* resume a previously-granted session without ever rejecting — the caller
   treats "false" as "not signed in, stay quiet". Loads GIS once per session;
   with cached consent the iframe re-grants silently, without it the error
   callback fires and we simply report false. */
export async function silentConnect(clientId: string): Promise<boolean> {
  if (!clientId.trim()) return false;
  if (accessToken) return true;
  try {
    await connectGoogle(clientId);
    return !!accessToken;
  } catch {
    tokenPromise = null;
    return false;
  }
}

export function disconnectGoogle() {
  const token = accessToken; // grab before clearing — revoke must get the real token
  accessToken = null;
  tokenPromise = null;
  clearConnected();
  try {
    if (token) window.google?.accounts?.oauth2?.revoke?.(token, () => { /* noop */ });
  } catch { /* best effort */ }
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  if (!accessToken) throw new Error('Not connected to Google Drive.');
  const r = await fetch(`https://www.googleapis.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) },
  });
  if (r.status === 401) {
    accessToken = null;
    throw new Error('Google session expired — reconnect.');
  }
  return r;
}

async function findFile(fileName: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${fileName}' and 'appDataFolder' in parents and trashed=false`);
  const r = await api(`/drive/v3/files?q=${q}&spaces=appDataFolder&fields=files(id,name)&pageSize=1`);
  if (!r.ok) throw new Error(`Drive search failed (${r.status}).`);
  const j = await r.json();
  return j.files?.[0]?.id || null;
}

export type SyncResult = { ok: boolean; error?: string; at?: string; found?: boolean };

/* upload (create or overwrite) the JSON snapshot under this account's filename */
export async function drivePush(clientId: string, fileName: string, data: unknown): Promise<SyncResult> {
  try {
    await connectGoogle(clientId);
    const body = JSON.stringify(data);
    const existing = await findFile(fileName);
    if (existing) {
      const r = await api(`/drive/v3/files/${existing}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!r.ok) throw new Error(`Upload failed (${r.status}).`);
    } else {
      const boundary = 'me' + Date.now();
      const meta = JSON.stringify({ name: fileName, parents: ['appDataFolder'] });
      const multipart = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        meta,
        `--${boundary}`,
        'Content-Type: application/json',
        '',
        body,
        `--${boundary}--`,
      ].join('\r\n');
      const r = await api(`/drive/v3/files?uploadType=multipart`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipart,
      });
      if (!r.ok) throw new Error(`Upload failed (${r.status}).`);
    }
    return { ok: true, at: new Date().toISOString() };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Drive upload failed.' };
  }
}

/* download this account's snapshot; found:false = nothing stored yet */
export async function drivePull<T>(clientId: string, fileName: string): Promise<SyncResult & { data?: T }> {
  try {
    await connectGoogle(clientId);
    const id = await findFile(fileName);
    if (!id) return { ok: false, found: false, error: 'No backup found in your Google Drive yet.' };
    const r = await api(`/drive/v3/files/${id}?alt=media`);
    if (!r.ok) throw new Error(`Download failed (${r.status}).`);
    const data = (await r.json()) as T;
    return { ok: true, found: true, data, at: new Date().toISOString() };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Drive download failed.' };
  }
}

/* ONE filename for every login — master, vendor, team and client all read and
   write the same copy, so their views stay integrated across devices.
   (kept accepting an account id so older call sites still compile) */
export const driveFileName = (_accountId?: string) => 'masters-eye-shared.json';

/* pre-shared-file backups were one per account — keep the old naming reachable
   so a pull can still find a backup made before the shared-copy change */
export const legacyDriveFileName = (accountId: string) => `masters-eye-${accountId}.json`;
