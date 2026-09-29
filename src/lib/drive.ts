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

export function disconnectGoogle() {
  accessToken = null;
  tokenPromise = null;
  try {
    window.google?.accounts?.oauth2?.revoke?.(accessToken || '', () => { /* noop */ });
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

/* one filename per account so master / vendor / team each own their Drive copy */
export const driveFileName = (accountId: string) => `masters-eye-${accountId}.json`;
