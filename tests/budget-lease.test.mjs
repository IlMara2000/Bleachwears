import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LEASE_MS, currentBudget, reserveGeneration } from "../lib/stencil/budget.ts";

const root = new URL("../", import.meta.url);

/**
 * Un Redis minimo che esegue i tre script del budget riconoscendoli dal tag
 * nella prima riga. Serve a provare anche il percorso condiviso: la lease deve
 * scadere da sola sia in memoria sia su Redis.
 */
function fakeRedis() {
  const counters = new Map();
  const zsets = new Map();
  const realFetch = globalThis.fetch;

  function sweepExpired(counterKey, leaseKey, now) {
    const held = zsets.get(leaseKey);
    if (!held) return;

    for (const [member, expiresAt] of [...held]) {
      if (expiresAt > now) continue;
      held.delete(member);
      counters.set(counterKey, (counters.get(counterKey) ?? 0) - 1);
    }
  }

  globalThis.fetch = async (_url, init) => {
    const [name, script, , counterKey, leaseKey, ...args] = JSON.parse(init.body);
    let result = null;

    if (name === "EVAL") {
      if (String(script).includes("bwslab:claim")) {
        const cap = Number(args[0]);
        const leaseMs = Number(args[1]);
        const now = Number(args[2]);

        sweepExpired(counterKey, leaseKey, now);

        const used = counters.get(counterKey) ?? 0;
        if (used >= cap) {
          result = [0, used];
        } else {
          counters.set(counterKey, used + 1);
          const held = zsets.get(leaseKey) ?? new Map();
          held.set(args[3], now + leaseMs);
          zsets.set(leaseKey, held);
          result = [1, used + 1];
        }
      } else if (String(script).includes("bwslab:release")) {
        const held = zsets.get(leaseKey);

        if (held?.delete(args[0])) {
          const left = (counters.get(counterKey) ?? 0) - 1;
          counters.set(counterKey, left);
          result = Math.max(0, left);
        } else {
          result = counters.get(counterKey) ?? 0;
        }
      } else if (String(script).includes("bwslab:confirm")) {
        zsets.get(leaseKey)?.delete(args[0]);
        result = counters.get(counterKey) ?? 0;
      } else if (String(script).includes("bwslab:read")) {
        sweepExpired(counterKey, leaseKey, Number(args[0]));
        result = counters.get(counterKey) ?? 0;
      }
    }

    return new Response(JSON.stringify({ result }), { status: 200 });
  };

  return {
    counters,
    restore() {
      globalThis.fetch = realFetch;
    },
  };
}

function withRedis() {
  const redis = fakeRedis();
  const saved = {
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  };

  process.env.KV_REST_API_URL = "https://kv.stub.local";
  process.env.KV_REST_API_TOKEN = "token-di-prova";

  return {
    redis,
    restore() {
      redis.restore();

      if (saved.url === undefined) delete process.env.KV_REST_API_URL;
      else process.env.KV_REST_API_URL = saved.url;

      if (saved.token === undefined) delete process.env.KV_REST_API_TOKEN;
      else process.env.KV_REST_API_TOKEN = saved.token;
    },
  };
}

test("a function killed mid-generation gives the slot back by itself", async () => {
  const realNow = Date.now;
  const at = (iso) => {
    Date.now = () => Date.parse(iso);
  };

  try {
    at("2026-09-01T10:00:00.000Z");
    const taken = await reserveGeneration("lab");
    assert.equal(taken.allowed, true);

    /*
     * La funzione viene uccisa qui: nessuno chiama refund. Il gettone resta
     * addebitato finché la lease non scade, e deve tornare da solo.
     */
    at(new Date(Date.parse("2026-09-01T10:00:00.000Z") + LEASE_MS - 1_000).toISOString());
    assert.equal((await currentBudget("lab")).used, 1, "la lease è scaduta mentre la generazione poteva ancora finire");
    assert.equal((await reserveGeneration("lab")).allowed, false, "il gettone è stato liberato troppo presto");

    at(new Date(Date.parse("2026-09-01T10:00:00.000Z") + LEASE_MS + 1_000).toISOString());
    assert.equal((await currentBudget("lab")).used, 0, "una funzione morta ha bruciato il gettone della giornata");

    const again = await reserveGeneration("lab");
    assert.equal(again.allowed, true, "dopo la scadenza la pressa deve poter riprovare");
    assert.equal(again.budget.used, 1);
  } finally {
    Date.now = realNow;
  }
});

test("a killed function frees the shared counter too, without anyone reporting it", async () => {
  const env = withRedis();
  const realNow = Date.now;
  const at = (iso) => {
    Date.now = () => Date.parse(iso);
  };

  try {
    at("2026-09-02T10:00:00.000Z");
    const taken = await reserveGeneration("prompt");
    assert.equal(taken.allowed, true);
    assert.equal(taken.budget.shared, true, "il test deve passare dallo store condiviso");

    /* Silenzio: la funzione non conferma e non si lamenta. */
    at(new Date(Date.parse("2026-09-02T10:00:00.000Z") + LEASE_MS + 1_000).toISOString());

    assert.equal((await currentBudget("prompt")).used, 0, "il contatore condiviso è rimasto addebitato");
    assert.equal((await reserveGeneration("prompt")).allowed, true);
  } finally {
    env.restore();
    Date.now = realNow;
  }
});

test("a confirmed print stays charged after its lease expires", async () => {
  const realNow = Date.now;
  const at = (iso) => {
    Date.now = () => Date.parse(iso);
  };

  try {
    at("2026-09-03T08:00:00.000Z");
    const taken = await reserveGeneration("lab");
    assert.equal(taken.allowed, true);

    /* La generazione è riuscita: la prenotazione diventa un addebito, non una lease. */
    await taken.confirm();

    at(new Date(Date.parse("2026-09-03T08:00:00.000Z") + LEASE_MS + 1_000).toISOString());
    assert.equal((await currentBudget("lab")).used, 1, "una stampa riuscita è stata rimborsata dalla scadenza");

    const refused = await reserveGeneration("lab");
    assert.equal(refused.allowed, false, "il tetto giornaliero è diventato un limite per sei minuti");
  } finally {
    Date.now = realNow;
  }
});

test("the lease outlives the function, and the browser gives up before the function does", async () => {
  assert.ok(
    LEASE_MS > 300_000,
    "la lease scade prima che la generazione possa finire: libererebbe un gettone ancora in uso",
  );

  const routes = ["app/api/bwslab/transform/route.ts", "app/api/bwslab/edit/route.ts"];

  for (const path of routes) {
    const source = await readFile(new URL(path, root), "utf8");
    const declared = source.match(/maxDuration\s*=\s*(\d+)/);
    assert.ok(declared, `${path}: maxDuration non dichiarato`);
    assert.equal(Number(declared[1]) * 1000, 300_000, `${path}: la lease va ricalibrata se cambia maxDuration`);
  }

  for (const path of ["app/bwslab/Studio.tsx", "app/bwslab/nfsw/PromptLab.tsx"]) {
    const source = await readFile(new URL(path, root), "utf8");
    const timeout = source.match(/CLIENT_TIMEOUT_MS\s*=\s*(\d+)_000/);
    assert.ok(timeout, `${path}: timeout del client non dichiarato`);
    assert.ok(
      Number(timeout[1]) * 1000 < 300_000,
      `${path}: il browser aspetta oltre la vita massima della funzione, quindi resta a fissare una risposta che non può più arrivare`,
    );
  }
});
