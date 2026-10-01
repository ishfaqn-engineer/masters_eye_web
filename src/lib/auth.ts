import { Account } from '../store';

const SESSION_KEY = 'masters-eye-session';

/* SHA-256 via WebCrypto; FNV-1a fallback for file:// WebViews where
   crypto.subtle may be unavailable. Never stores the PIN itself. */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  try {
    if (globalThis.crypto?.subtle) {
      const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch { /* fall through */ }
  let h = 0x811c9dc5;
  for (const b of data) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return `fnv-${h.toString(16)}`;
}

export async function verifyPin(account: Account, pin: string): Promise<boolean> {
  if (!pin) return false;
  if ((await hashPin(pin, account.id)) === account.pinHash) return true;
  // server-registered accounts hash the password against the username
  if (account.username && (await hashPin(pin, account.username)) === account.pinHash) return true;
  return false;
}

export async function makeAccount(input: {
  name: string;
  role: Account['role'];
  pin: string;
  vendorId?: string;
  workerId?: string;
  clientId?: string;
  photo?: string;
}): Promise<Account> {
  const id = `${input.role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    name: input.name,
    role: input.role,
    pinHash: await hashPin(input.pin, id),
    vendorId: input.vendorId,
    workerId: input.workerId,
    clientId: input.clientId,
    photo: input.photo,
  };
}

export const readSession = (): string | null => {
  try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
};

export const writeSession = (accountId: string) => {
  try { localStorage.setItem(SESSION_KEY, accountId); } catch { /* private mode */ }
};

export const clearSession = () => {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
};
