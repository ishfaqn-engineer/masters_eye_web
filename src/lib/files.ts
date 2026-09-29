/* IndexedDB blob store — keeps photos/PDFs out of localStorage (5MB limit). */

export type Attachment = {
  id: string;
  name: string;
  type: 'image' | 'pdf';
  mime: string;
  size: number;
  createdAt: string;
};

const DB = 'masters-eye-files';
const STORE = 'blobs';
const META = 'meta';

let dbP: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbP) {
    dbP = new Promise((res, rej) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
      req.onblocked = () => rej(new Error('IndexedDB blocked'));
    });
    // don't cache a rejected connection — allow the next call to retry
    dbP = dbP.catch(err => {
      dbP = null;
      throw err;
    });
  }
  return dbP;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(db => new Promise<T>((res, rej) => {
    const t = db.transaction(store, mode);
    let settled = false;
    const done = (fn2: () => void) => { if (!settled) { settled = true; fn2(); } };
    const r = fn(t.objectStore(store));
    r.onsuccess = () => done(() => res(r.result));
    r.onerror = () => done(() => rej(r.error));
    t.onabort = () => done(() => rej(t.error || new Error('transaction aborted')));
  }));
}

export async function putFile(file: File): Promise<Attachment> {
  const id = 'f' + Date.now() + Math.random().toString(36).slice(2, 7);
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const meta: Attachment = {
    id,
    name: file.name || (isPdf ? 'document.pdf' : 'photo.jpg'),
    type: isPdf ? 'pdf' : 'image',
    mime: file.type || (isPdf ? 'application/pdf' : 'image/jpeg'),
    size: file.size,
    createdAt: new Date().toISOString(),
  };
  await tx(STORE, 'readwrite', s => s.put(file, id));
  await tx(META, 'readwrite', s => s.put(meta));
  return meta;
}

export const getMeta = (id: string) => tx<Attachment | undefined>(META, 'readonly', s => s.get(id));

export const getBlob = (id: string) => tx<Blob | undefined>(STORE, 'readonly', s => s.get(id));

const urlCache = new Map<string, string>();

export async function removeFile(id: string) {
  const cached = urlCache.get(id);
  if (cached) { URL.revokeObjectURL(cached); urlCache.delete(id); }
  await tx(STORE, 'readwrite', s => s.delete(id));
  await tx(META, 'readwrite', s => s.delete(id));
}

/* used by "Reset all data" so orphaned photos/PDFs don't linger forever */
export async function clearFiles() {
  urlCache.forEach(u => URL.revokeObjectURL(u));
  urlCache.clear();
  await tx(STORE, 'readwrite', s => s.clear());
  await tx(META, 'readwrite', s => s.clear());
}

export async function urlFor(id: string): Promise<string | null> {
  if (urlCache.has(id)) return urlCache.get(id)!;
  const b = await getBlob(id);
  if (!b) return null;
  const u = URL.createObjectURL(b);
  urlCache.set(id, u);
  return u;
}
