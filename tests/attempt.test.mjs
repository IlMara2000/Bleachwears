import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ATTEMPT_TTL_MS, attemptId, finishAttempt, startAttempt } from "../lib/stencil/attempt.ts";
import { requestIdFrom } from "../lib/stencil/idempotency.ts";

const root = new URL("../", import.meta.url);

/** Uno sessionStorage finto: la Map è tutto ciò che il modulo usa. */
function fakeStorage() {
  const items = new Map();
  return {
    items,
    storage: {
      getItem: (key) => (items.has(key) ? items.get(key) : null),
      setItem: (key, value) => void items.set(key, String(value)),
      removeItem: (key) => void items.delete(key),
    },
  };
}

function withStorage(storage) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", { value: storage, configurable: true });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, "sessionStorage", descriptor);
    else delete globalThis.sessionStorage;
  };
}

const T0 = Date.parse("2026-11-16T09:00:00.000Z");

test("a retry sends the same id, so the server can hand back the image it already made", () => {
  const { storage } = fakeStorage();
  const restore = withStorage(storage);

  try {
    const first = startAttempt("lab", T0);
    const retry = startAttempt("lab", T0 + 5_000);

    assert.equal(retry, first, "il secondo clic ha comprato una seconda generazione");
    assert.equal(attemptId("lab", T0 + 5_000), first);
    assert.match(first, /^[A-Za-z0-9_-]{8,128}$/);

    /* La stessa regola che applica l'API: l'id che salviamo è uno che il server accetta. */
    const header = new Request("https://press.test/api/bwslab/transform", {
      headers: { "X-Stencil-Request-Id": first },
    });
    assert.equal(requestIdFrom(header), first);
  } finally {
    restore();
  }
});

test("the id survives a reload, because it is saved and not kept in a component", () => {
  const { storage, items } = fakeStorage();
  const restore = withStorage(storage);

  try {
    const id = startAttempt("lab", T0);
    const saved = items.get("bwslab:attempt:lab");
    assert.ok(saved, "l'id non è stato salvato");

    /* Ricaricare la pagina vuol dire solo rileggere lo stesso salvataggio. */
    assert.equal(JSON.parse(saved).id, id);
    assert.equal(attemptId("lab", T0 + 1_000), id);
  } finally {
    restore();
  }
});

test("once the image arrives the attempt is closed and the next click is a new order", () => {
  const { storage } = fakeStorage();
  const restore = withStorage(storage);

  try {
    const id = startAttempt("prompt", T0);
    finishAttempt("prompt");

    assert.equal(attemptId("prompt", T0), null);
    const next = startAttempt("prompt", T0 + 1_000);
    assert.notEqual(next, id, "il clic successivo ha riusato l'id di un tentativo chiuso");
  } finally {
    restore();
  }
});

test("the two presses never share an id", () => {
  const { storage } = fakeStorage();
  const restore = withStorage(storage);

  try {
    const lab = startAttempt("lab", T0);
    const prompt = startAttempt("prompt", T0);

    assert.notEqual(lab, prompt);
    assert.equal(attemptId("lab", T0), lab);
    assert.equal(attemptId("prompt", T0), prompt);
  } finally {
    restore();
  }
});

test("a stale or tampered id is not sent back to the server", () => {
  const { storage, items } = fakeStorage();
  const restore = withStorage(storage);

  try {
    items.set("bwslab:attempt:lab", JSON.stringify({ id: "vecchio-id-1", at: T0 - ATTEMPT_TTL_MS - 1 }));
    assert.equal(attemptId("lab", T0), null, "un id scaduto non deve tornare all'API");

    items.set("bwslab:attempt:lab", JSON.stringify({ id: "../../etc/passwd", at: T0 }));
    assert.equal(attemptId("lab", T0), null, "un id fuori formato non deve diventare una chiave");

    items.set("bwslab:attempt:lab", "{non è json");
    assert.equal(attemptId("lab", T0), null);

    const fresh = startAttempt("lab", T0);
    assert.match(fresh, /^[A-Za-z0-9_-]{8,128}$/, "dopo un salvataggio illeggibile deve ripartire da un id nuovo");
  } finally {
    restore();
  }
});

test("storage that throws does not break the press", () => {
  const breaking = {
    getItem() {
      throw new Error("modalità privata");
    },
    setItem() {
      throw new Error("quota");
    },
    removeItem() {
      throw new Error("quota");
    },
  };
  const restore = withStorage(breaking);

  try {
    const id = startAttempt("lab", T0);
    assert.match(id, /^[A-Za-z0-9_-]{8,128}$/);
    assert.equal(attemptId("lab", T0), null);
    finishAttempt("lab");
  } finally {
    restore();
  }
});

test("the lab page sends the id and keeps it until the image comes back", async () => {
  const source = await readFile(new URL("app/bwslab/Studio.tsx", root), "utf8");

  assert.match(source, /startAttempt\("lab"\)/, "la pagina del laboratorio non chiede un id");
  assert.match(source, /"X-Stencil-Request-Id": requestId/, "l'id non viene mandato al server");
  assert.ok(
    source.indexOf('finishAttempt("lab")') > source.indexOf('blob = await response.blob()'),
    "l'id viene chiuso prima di avere l'immagine, quindi il retry non la troverebbe",
  );
});

test("a request refused before generating frees its id instead of leaving it busy", async () => {
  for (const path of ["app/api/bwslab/transform/route.ts", "app/api/bwslab/edit/route.ts"]) {
    const source = await readFile(new URL(path, root), "utf8");

    const budget = source.indexOf("reserveGeneration(");
    const release = source.lastIndexOf("failRequest(requestId)", budget);
    assert.ok(release > 0 && release < budget, `${path}: un rifiuto del tetto lascia l'id occupato`);

    const upload = source.indexOf("if (!uploaded.ok)");
    assert.ok(
      source.slice(upload, upload + 120).includes("failRequest(requestId)"),
      `${path}: un caricamento rifiutato lascia l'id occupato`,
    );
  }
});
