import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PRINT_TTL_MS, clearPrint, forgetArchive, loadPrint, savePrint } from "../lib/stencil/archive.ts";

const root = new URL("../", import.meta.url);

/**
 * Un IndexedDB finto con la sola parte che il modulo usa: una Map per store,
 * richieste con onsuccess e un `open` che chiama onupgradeneeded poi onsuccess.
 */
function fakeIndexedDb() {
  const records = new Map();
  let failPuts = 0;

  const makeRequest = (run) => {
    const request = {};
    setTimeout(() => {
      try {
        request.result = run();
        request.onsuccess?.({ target: request });
      } catch (error) {
        request.error = error;
        request.onerror?.({ target: request });
      }
    }, 0);
    return request;
  };

  const db = {
    objectStoreNames: { contains: (name) => name === "prints" },
    createObjectStore() {},
    transaction: () => ({
      objectStore: () => ({
        get: (key) => makeRequest(() => records.get(key)),
        put: (value) =>
          makeRequest(() => {
            if (failPuts > 0) {
              failPuts -= 1;
              throw new Error("QuotaExceededError");
            }
            records.set(value.scope, value);
            return value.scope;
          }),
        delete: (key) =>
          makeRequest(() => {
            records.delete(key);
            return undefined;
          }),
      }),
    }),
  };

  return {
    records,
    failPuts(count) {
      failPuts = count;
    },
    indexedDB: {
      open() {
        const request = {};
        setTimeout(() => {
          request.result = db;
          request.onupgradeneeded?.({ target: request });
          request.onsuccess?.({ target: request });
        }, 0);
        return request;
      },
    },
  };
}

function withIndexedDb(value) {
  const factory = value === undefined ? fakeIndexedDb() : value;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  Object.defineProperty(globalThis, "indexedDB", {
    value: factory === null ? undefined : factory.indexedDB,
    configurable: true,
  });
  forgetArchive();

  return {
    ...(factory ?? {}),
    restore() {
      if (descriptor) Object.defineProperty(globalThis, "indexedDB", descriptor);
      else delete globalThis.indexedDB;
      forgetArchive();
    },
  };
}

const result = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });

const print = {
  scope: "lab",
  at: Date.parse("2026-11-16T10:00:00.000Z"),
  requestId: "req-abcdefgh",
  params: { style: "cartoon", engine: "remote" },
  result,
  resultWidth: 1600,
  resultHeight: 1200,
  fileName: "stencil-lab.png",
  ms: 4200,
  source: new Blob([new Uint8Array([9, 9])], { type: "image/jpeg" }),
};

test("a reload finds the print, its settings and the input it came from", async () => {
  const fake = withIndexedDb();

  try {
    assert.equal(await savePrint(print), true);

    const loaded = await loadPrint("lab", print.at + 1_000);
    assert.ok(loaded, "la stampa non è stata ritrovata");
    assert.equal(loaded.requestId, "req-abcdefgh");
    assert.deepEqual(loaded.params, { style: "cartoon", engine: "remote" });
    assert.equal(loaded.fileName, "stencil-lab.png");
    assert.equal(loaded.resultWidth, 1600);
    assert.equal([...new Uint8Array(await loaded.result.arrayBuffer())].join(","), "1,2,3");
    assert.ok(loaded.source, "senza l'input il reload non può ristampare la stessa immagine");
  } finally {
    fake.restore();
  }
});

test("each press keeps one print, and the second does not overwrite the first", async () => {
  const fake = withIndexedDb();

  try {
    await savePrint(print);
    await savePrint({
      ...print,
      scope: "prompt",
      params: { prompt: "rendilo grafico" },
      fileName: "prompt-press.png",
    });
    await savePrint({ ...print, fileName: "stencil-lab-2.png", at: print.at + 5_000 });

    const lab = await loadPrint("lab", print.at + 6_000);
    const prompt = await loadPrint("prompt", print.at + 6_000);

    assert.equal(lab.fileName, "stencil-lab-2.png", "la pressa del laboratorio tiene solo l'ultima stampa");
    assert.equal(prompt.fileName, "prompt-press.png");
    assert.equal(fake.records.size, 2, "le due presse devono avere un record ciascuna");
  } finally {
    fake.restore();
  }
});

test("an old print is not shown as if it were still the last one", async () => {
  const fake = withIndexedDb();

  try {
    await savePrint(print);

    assert.ok(await loadPrint("lab", print.at + PRINT_TTL_MS - 1), "dentro la settimana la stampa deve ancora esserci");
    const stale = await loadPrint("lab", print.at + PRINT_TTL_MS + 1);
    assert.equal(stale, null);
    assert.equal(fake.records.has("lab"), false, "un record scaduto deve essere tolto, non solo ignorato");
  } finally {
    fake.restore();
  }
});

test("when the browser is out of room the image survives without its input", async () => {
  const fake = withIndexedDb();

  try {
    fake.failPuts(1);

    assert.equal(await savePrint(print), true, "la stampa è andata persa per colpa dell'input");

    const loaded = await loadPrint("lab", print.at + 1_000);
    assert.ok(loaded);
    assert.equal(loaded.source, undefined);
    assert.equal([...new Uint8Array(await loaded.result.arrayBuffer())].join(","), "1,2,3");
  } finally {
    fake.restore();
  }
});

test("clearing the archive leaves nothing behind", async () => {
  const fake = withIndexedDb();

  try {
    await savePrint(print);
    await clearPrint("lab");

    assert.equal(await loadPrint("lab", print.at + 1_000), null);
  } finally {
    fake.restore();
  }
});

test("a browser without IndexedDB keeps the press working, just without memory", async () => {
  const fake = withIndexedDb(null);

  try {
    assert.equal(await savePrint(print), false);
    assert.equal(await loadPrint("lab"), null);
    await clearPrint("lab");
  } finally {
    fake.restore();
  }
});

test("both presses archive the print and read it back on load", async () => {
  for (const [path, scope] of [
    ["app/bwslab/Studio.tsx", "lab"],
    ["app/bwslab/nfsw/PromptLab.tsx", "prompt"],
  ]) {
    const source = await readFile(new URL(path, root), "utf8");

    assert.match(source, new RegExp(`savePrint\\(`), `${path}: non salva la stampa`);
    assert.match(source, new RegExp(`loadPrint\\("${scope}"\\)`), `${path}: non la rilegge al caricamento`);
    assert.match(source, /scope: "lab"|scope: "prompt"/, `${path}: salva senza dire a quale pressa appartiene`);
    assert.doesNotMatch(
      source,
      /Elaborata in memoria · mai salvata/,
      `${path}: la pagina dice ancora che l'immagine non viene salvata`,
    );
  }
});
