import { activeProvider } from "./provider.ts";

/**
 * The spend guard. Stencil Lab calls a paid model, so the server keeps its own
 * daily ceiling and refuses before calling the provider: the page must stop on
 * our own number, not on an upstream "quota exhausted" half a generation later.
 *
 * The slot is taken before the provider is called, because a guard that counts
 * only clean exits can overshoot. If the generation then fails, the slot goes
 * back: the ceiling is on images produced, so an error must not cost one.
 *
 * The counter lives in Redis when a REST endpoint is configured (Vercel KV and
 * Upstash speak the same dialect); otherwise it lives in this instance memory,
 * which on serverless is a per-instance approximation and nothing more.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const KEY_PREFIX = "bwslab:spend";

/**
 * Each page has its own ceiling: the lab prints with the model, the prompt press
 * takes instructions. Sharing one counter meant one page could eat the other's
 * generation, which is not what either page promises.
 */
export type SpendScope = "lab" | "prompt";

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
  /**
   * Check and increment in one indivisible step. Two requests that arrive
   * together must not both see the last slot: the cap is a limit, not a hint.
   */
  admit(key: string, cap: number, ttlMs: number): Promise<{ allowed: boolean; used: number }>;
  decrement(key: string): Promise<number>;
  read(key: string): Promise<number>;
};

const memory = new Map<string, { count: number; resetAt: number }>();

const memoryStore: Store = {
  shared: false,
  async admit(key, cap, ttlMs) {
    const now = Date.now();
    const entry = memory.get(key);
    const live = entry && entry.resetAt > now ? entry : null;
    const used = live ? live.count : 0;

    /* Node runs this function to completion, so read-then-write cannot interleave. */
    if (used >= cap) return { allowed: false, used };

    memory.set(key, { count: used + 1, resetAt: live ? live.resetAt : now + ttlMs });
    return { allowed: true, used: used + 1 };
  },
  async decrement(key) {
    const entry = memory.get(key);
    if (!entry || entry.resetAt <= Date.now()) return 0;

    entry.count = Math.max(0, entry.count - 1);
    return entry.count;
  },
  async read(key) {
    const entry = memory.get(key);
    return entry && entry.resetAt > Date.now() ? entry.count : 0;
  },
};

/**
 * Admission in a single round trip. Redis runs a script atomically, so two
 * requests arriving together cannot both read "one slot left" and both take it;
 * a refusal never writes anything, which is why no rollback is needed.
 * Returns { admitted, used }.
 */
const ADMIT_SCRIPT = `local used = tonumber(redis.call('GET', KEYS[1]) or '0')
local cap = tonumber(ARGV[1])
if used >= cap then
  return { 0, used }
end
local taken = redis.call('INCR', KEYS[1])
if taken == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return { 1, taken }`;

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
    async admit(key, cap, ttlMs) {
      const result = await call(["EVAL", ADMIT_SCRIPT, 1, key, String(cap), String(Math.round(ttlMs))]);

      if (!Array.isArray(result) || result.length < 2) throw new Error("risposta inattesa dal contatore");

      return { allowed: Number(result[0]) === 1, used: Number(result[1]) || 0 };
    },
    async decrement(key) {
      const count = Number(await call(["DECR", key]));
      if (!Number.isFinite(count)) return 0;

      /* Never leave a negative counter behind: it would hand out free slots. */
      if (count < 0) {
        await call(["SET", key, 0]);
        return 0;
      }

      return count;
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
 * A hosted model defaults to one generation a day: enough to try the press,
 * small enough that a leaked URL cannot burn a card even if left alone.
 */
function configuredCap(): number {
  const raw = process.env.STENCIL_DAILY_CAP?.trim();

  if (raw) {
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) return Math.floor(value);
  }

  return activeProvider() === "local" ? 0 : 1;
}

function dayKey(now: number, scope: SpendScope): string {
  return `${KEY_PREFIX}:${scope}:${new Date(now).toISOString().slice(0, 10)}`;
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
export async function currentBudget(scope: SpendScope = "prompt"): Promise<Budget> {
  const now = Date.now();
  const store = configuredStore();
  const cap = configuredCap();

  if (cap === 0) return unlimited(store, now);

  let used = 0;
  try {
    used = await store.read(dayKey(now, scope));
  } catch (error) {
    console.error(JSON.stringify({ event: "bwslab.budget", ok: false, reason: "store", error: String(error) }));
  }

  return withUsage(cap, used, store, now);
}

export type Reservation = {
  allowed: boolean;
  budget: Budget;
  /**
   * Gives the slot back when the provider produced no image. It hits the day
   * the slot was taken on, not the day the failure landed: a generation that
   * starts at 23:59 and fails at 00:01 must not refund tomorrow's counter,
   * which would hand out a free generation on top of a spent one.
   */
  refund(): Promise<void>;
};

/** Nothing was taken, so there is nothing to give back. */
const nothingToRefund = async (): Promise<void> => undefined;

/**
 * Called right before a generation. `allowed: false` means the provider is
 * never contacted, so nothing is billed.
 */
export async function reserveGeneration(scope: SpendScope = "prompt"): Promise<Reservation> {
  const now = Date.now();
  const store = configuredStore();
  const cap = configuredCap();

  if (cap === 0) return { allowed: true, budget: unlimited(store, now), refund: nothingToRefund };

  /* Captured here, once: the day is a property of the reservation. */
  const key = dayKey(now, scope);

  let admission: { allowed: boolean; used: number };
  try {
    admission = await store.admit(key, cap, DAY_MS);
  } catch (error) {
    /*
     * A dead counter must not take the page down: the provider's own quota is
     * still the hard stop. Say it out loud in the log instead of hiding it.
     */
    console.error(JSON.stringify({ event: "bwslab.budget", ok: false, reason: "store", error: String(error) }));
    return { allowed: true, budget: unlimited(store, now), refund: nothingToRefund };
  }

  const refund = async (): Promise<void> => {
    try {
      await store.decrement(key);
    } catch (error) {
      console.error(JSON.stringify({ event: "bwslab.budget", ok: false, reason: "refund", error: String(error) }));
    }
  };

  /* Nothing was written when the store refused, so there is nothing to undo. */
  if (!admission.allowed) {
    return { allowed: false, budget: withUsage(cap, admission.used, store, now), refund: nothingToRefund };
  }

  return { allowed: true, budget: withUsage(cap, admission.used, store, now), refund };
}

export function budgetMessage(budget: Budget): string {
  /* The refusal itself is an attempt already counted, so show the ceiling, not the overshoot. */
  const shown = Math.min(budget.used, budget.cap);
  return `Tetto giornaliero raggiunto (${shown}/${budget.cap}). Nessun addebito: il contatore si azzera alle 00:00 UTC. Prova domani.`;
}
