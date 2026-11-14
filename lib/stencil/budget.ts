import { activeProvider } from "./provider";

/**
 * The spend guard. Stencil Lab calls a paid model, so the server keeps its own
 * daily ceiling and refuses before calling the provider: the page must stop on
 * our own number, not on an upstream "quota exhausted" half a generation later.
 *
 * Attempts are counted, not successes. A generation that fails halfway may
 * already have been charged, and a guard that only counts clean exits always
 * spends a little more than it promises.
 *
 * The counter lives in Redis when a REST endpoint is configured (Vercel KV and
 * Upstash speak the same dialect); otherwise it lives in this instance memory,
 * which on serverless is a per-instance approximation and nothing more.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const KEY_PREFIX = "bwslab:spend";

export type Budget = {
  /** Generations per day. 0 means this provider spends nothing. */
  cap: number;
  used: number;
  /** Generations left today; -1 when there is no ceiling. */
  remaining: number;
  /** When the counter goes back to zero (ISO, midnight UTC). */
  resetAt: string;
  /** false means the count is per instance, not global. */
  shared: boolean;
};

type Store = {
  shared: boolean;
  increment(key: string, ttlMs: number): Promise<number>;
  read(key: string): Promise<number>;
};

const memory = new Map<string, { count: number; resetAt: number }>();

const memoryStore: Store = {
  shared: false,
  async increment(key, ttlMs) {
    const now = Date.now();
    const entry = memory.get(key);

    if (!entry || entry.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + ttlMs };
      memory.set(key, fresh);
      return fresh.count;
    }

    entry.count += 1;
    return entry.count;
  },
  async read(key) {
    const entry = memory.get(key);
    return entry && entry.resetAt > Date.now() ? entry.count : 0;
  },
};

/** Vercel KV and Upstash answer the same REST commands, so one client serves both. */
function restStore(url: string, token: string): Store {
  const call = async (command: unknown[]): Promise<unknown> => {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) throw new Error(`kv ${response.status}`);
    const payload = (await response.json()) as { result?: unknown };
    return payload.result;
  };

  return {
    shared: true,
    async increment(key, ttlMs) {
      const count = Number(await call(["INCR", key]));
      /* The first increment of the day sets the expiry, so the key dies by itself. */
      if (count === 1) await call(["PEXPIRE", key, Math.round(ttlMs)]);
      return Number.isFinite(count) ? count : 0;
    },
    async read(key) {
      const value = Number(await call(["GET", key]));
      return Number.isFinite(value) ? value : 0;
    },
  };
}

function configuredStore(): Store {
  const candidates: Array<[string | undefined, string | undefined]> = [
    [process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN],
    [process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN],
  ];

  for (const [url, token] of candidates) {
    if (url?.trim() && token?.trim()) return restStore(url.trim(), token.trim());
  }

  return memoryStore;
}

/**
 * A local model costs nothing, so it has no ceiling unless one is asked for.
 * A hosted model defaults to the smallest useful number: six generations, the
 * free Cloudflare allowance, so a leaked URL cannot burn a card overnight.
 */
function configuredCap(): number {
  const raw = process.env.STENCIL_DAILY_CAP?.trim();

  if (raw) {
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) return Math.floor(value);
  }

  return activeProvider() === "local" ? 0 : 6;
}

function dayKey(now: number): string {
  return `${KEY_PREFIX}:${new Date(now).toISOString().slice(0, 10)}`;
}

function resetAtFor(now: number): string {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
}

function unlimited(store: Store, now: number): Budget {
  return { cap: 0, used: 0, remaining: -1, resetAt: resetAtFor(now), shared: store.shared };
}

function withUsage(cap: number, used: number, store: Store, now: number): Budget {
  return {
    cap,
    used,
    remaining: Math.max(0, cap - used),
    resetAt: resetAtFor(now),
    shared: store.shared,
  };
}

/** Read-only view for the status endpoint: costs nothing, spends nothing. */
export async function currentBudget(): Promise<Budget> {
  const now = Date.now();
  const store = configuredStore();
  const cap = configuredCap();

  if (cap === 0) return unlimited(store, now);

  let used = 0;
  try {
    used = await store.read(dayKey(now));
  } catch (error) {
    console.error(JSON.stringify({ event: "bwslab.budget", ok: false, reason: "store", error: String(error) }));
  }

  return withUsage(cap, used, store, now);
}

/**
 * Called right before a generation. `allowed: false` means the provider is
 * never contacted, so nothing is billed.
 */
export async function reserveGeneration(): Promise<{ allowed: boolean; budget: Budget }> {
  const now = Date.now();
  const store = configuredStore();
  const cap = configuredCap();

  if (cap === 0) return { allowed: true, budget: unlimited(store, now) };

  let used: number;
  try {
    used = await store.increment(dayKey(now), DAY_MS);
  } catch (error) {
    /*
     * A dead counter must not take the page down: the provider's own quota is
     * still the hard stop. Say it out loud in the log instead of hiding it.
     */
    console.error(JSON.stringify({ event: "bwslab.budget", ok: false, reason: "store", error: String(error) }));
    return { allowed: true, budget: unlimited(store, now) };
  }

  return { allowed: used <= cap, budget: withUsage(cap, used, store, now) };
}

export function budgetMessage(budget: Budget): string {
  /* The refusal itself is an attempt already counted, so show the ceiling, not the overshoot. */
  const shown = Math.min(budget.used, budget.cap);
  return `Tetto giornaliero raggiunto (${shown}/${budget.cap}). Nessun addebito: il contatore si azzera alle 00:00 UTC. Prova domani.`;
}
