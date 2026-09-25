/**
 * Minimal IndexedDB wrapper (no external dependency).
 * Used for: session cache, document-list cache, offline Yjs snapshots.
 */
const DB_NAME = "sync-engine";
const DB_VERSION = 1;

const STORES = {
  kv: "kv", // key -> { key, value }
  docs: "docs", // docId -> { id, value, updatedAt }
  yjs: "yjs", // docId -> { id, state: Uint8Array, updatedAt }
} as const;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.kv)) db.createObjectStore(STORES.kv, { keyPath: "key" });
      if (!db.objectStoreNames.contains(STORES.docs)) db.createObjectStore(STORES.docs, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORES.yjs)) db.createObjectStore(STORES.yjs, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        let req: IDBRequest<T>;
        try {
          req = fn(s);
        } catch (e) {
          db.close();
          reject(e);
          return;
        }
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("IDB request failed"));
        t.oncomplete = () => db.close();
        t.onerror = () => {
          db.close();
          reject(t.error ?? new Error("IDB transaction failed"));
        };
      })
  );
}

const memFallback = new Map<string, unknown>();

export const idb = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const row = await tx<{ key: string; value: T } | undefined>(STORES.kv, "readonly", (s) =>
        s.get(key)
      );
      return row?.value ?? null;
    } catch {
      return (memFallback.get(`kv:${key}`) as T) ?? null;
    }
  },
  async set<T>(key: string, value: T): Promise<void> {
    memFallback.set(`kv:${key}`, value);
    try {
      await tx(STORES.kv, "readwrite", (s) => s.put({ key, value }));
    } catch {
      /* memory fallback already set */
    }
  },
  async del(key: string): Promise<void> {
    memFallback.delete(`kv:${key}`);
    try {
      await tx(STORES.kv, "readwrite", (s) => s.delete(key));
    } catch {
      /* noop */
    }
  },

  async cacheDocs(docs: unknown[]): Promise<void> {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES.docs, "readwrite");
        const s = t.objectStore(STORES.docs);
        for (const d of docs as Array<{ id: string }>) {
          s.put({ id: d.id, value: d, updatedAt: Date.now() });
        }
        t.oncomplete = () => {
          db.close();
          resolve();
        };
        t.onerror = () => {
          db.close();
          reject(t.error);
        };
      });
    } catch {
      memFallback.set("docs:list", docs);
    }
  },
  async getCachedDocs<T>(): Promise<T[] | null> {
    try {
      const db = await openDb();
      const rows = await new Promise<Array<{ value: T }>>((resolve, reject) => {
        const t = db.transaction(STORES.docs, "readonly");
        const req = t.objectStore(STORES.docs).getAll();
        req.onsuccess = () => resolve(req.result as Array<{ value: T }>);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      });
      if (rows.length === 0) return (memFallback.get("docs:list") as T[]) ?? null;
      return rows.map((r) => r.value);
    } catch {
      return (memFallback.get("docs:list") as T[]) ?? null;
    }
  },

  async saveYState(docId: string, state: Uint8Array): Promise<void> {
    try {
      await tx(STORES.yjs, "readwrite", (s) =>
        s.put({ id: docId, state, updatedAt: Date.now() })
      );
    } catch {
      memFallback.set(`yjs:${docId}`, state);
    }
  },
  async loadYState(docId: string): Promise<Uint8Array | null> {
    try {
      const row = await tx<{ id: string; state: Uint8Array } | undefined>(STORES.yjs, "readonly", (s) =>
        s.get(docId)
      );
      return row?.state ?? ((memFallback.get(`yjs:${docId}`) as Uint8Array) ?? null);
    } catch {
      return (memFallback.get(`yjs:${docId}`) as Uint8Array) ?? null;
    }
  },
  async clearYState(docId: string): Promise<void> {
    memFallback.delete(`yjs:${docId}`);
    try {
      await tx(STORES.yjs, "readwrite", (s) => s.delete(docId));
    } catch {
      /* noop */
    }
  },
};

export const IDB_KEYS = {
  session: "session",
  docsList: "docs:list-meta",
} as const;
