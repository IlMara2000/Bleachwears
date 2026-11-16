/**
 * Where a print survives the page.
 *
 * One generation a day makes a reload expensive: the image exists only as a
 * blob URL, so closing the tab threw away the only thing the slot bought. This
 * keeps the result, the input it came from and the settings that produced it in
 * IndexedDB — the browser's own storage, no account, nothing sent anywhere.
 *
 * One record per press: the archive is a "last print", not a gallery, so it
 * cannot grow without bound. The input is stored too, which is what makes the
 * reload useful: without it there is nothing to press again.
 */

export type PrintScope = "lab" | "prompt";

/** Settings are whatever the page had selected: only plain values belong here. */
export type PrintParams = Record<string, string | number | boolean>;

export type StoredPrint = {
  scope: PrintScope;
  at: number;
  /** The attempt the server remembers, so a resume collects instead of buying. */
  requestId: string | null;
  params: PrintParams;
  result: Blob;
  resultWidth: number;
  resultHeight: number;
  fileName: string;
  ms: number;
  /** The prepared upload the print came from. */
  source?: Blob;
  /** The second, free print of the same generation, when the page made one. */
  cartoon?: Blob;
};

const DB_NAME = "bwslab";
const DB_VERSION = 1;
const STORE = "prints";

/** After a week a print is history, not something to show on load. */
export const PRINT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Store = IDBObjectStore;

function factory(): IDBFactory | null {
  try {
    return typeof indexedDB === "undefined" ? null : indexedDB;
  } catch {
    return null;
  }
}

let opening: Promise<IDBDatabase | null> | null = null;

/**
 * Opened once per page. A browser that refuses storage (private mode, blocked
 * site data) is not an error: the press simply works without an archive.
 */
function database(): Promise<IDBDatabase | null> {
  if (opening) return opening;

  const idb = factory();
  if (!idb) {
    opening = Promise.resolve(null);
    return opening;
  }

  opening = new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest;

    try {
      request = idb.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "scope" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return opening;
}

/** Wraps one request in a promise; a refusal is answered as null, never thrown. */
function ask<T>(run: (store: Store) => IDBRequest<T>): Promise<T | null> {
  return database().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }

        let request: IDBRequest<T>;
        try {
          request = run(db.transaction(STORE, "readwrite").objectStore(STORE));
        } catch {
          resolve(null);
          return;
        }

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      }),
  );
}

/** The print of this press, if it is still young enough to be the last one. */
export async function loadPrint(scope: PrintScope, now: number = Date.now()): Promise<StoredPrint | null> {
  const record = await ask<StoredPrint | undefined>((store) => store.get(scope));
  if (!record) return null;

  if (!record.result || now - Number(record.at) > PRINT_TTL_MS) {
    await clearPrint(scope);
    return null;
  }

  return record;
}

/**
 * Saves the print of this press, replacing the previous one. The input can be
 * many megabytes, so when the browser is out of room the result is kept and the
 * input dropped: losing the settings is better than losing the image.
 */
export async function savePrint(print: StoredPrint): Promise<boolean> {
  const stored = await ask((store) => store.put(print));
  if (stored !== null) return true;

  if (!print.source) return false;

  const withoutSource: StoredPrint = { ...print, source: undefined };
  return (await ask((store) => store.put(withoutSource))) !== null;
}

export async function clearPrint(scope: PrintScope): Promise<void> {
  await ask((store) => store.delete(scope));
}

/** Tests only: the opened connection is process state and must not leak between cases. */
export function forgetArchive(): void {
  opening = null;
}
