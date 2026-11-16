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
 * A function killed by the platform never gets to give anything back, so the
 * slot is not held by the counter alone: every reservation carries a lease.
 * When the lease runs out without a result, the next reader takes the slot back
 * by itself — no callback, no cron, nothing that has to survive the death.
 *
 * The counter lives in Redis when a REST endpoint is configured (Vercel KV and
 * Upstash speak the same dialect); otherwise it lives in this instance memory,
 * which on serverless is a per-instance approximation and nothing more.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const KEY_PREFIX = "bwslab:spend";

/**
 * How long a reservation holds its slot without confirming.
 *
 * The routes allow a generation to run for 300 seconds, so the lease must
 * outlive that: releasing earlier would let a second request take a slot the
 * first one is still using. Six minutes leaves a margin over the platform's own
 * deadline, which is the moment the function disappears without a word.
 */
export const LEASE_MS = 6 * 60 * 1000;

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

type ClaimResult = { allowed: boolean; used: number };

type Store = {
  shared: boolean;
  /**
   * Take a slot and leave a lease on it in one indivisible step. Two requests
   * that arrive together must not both see the last slot: the cap is a limit,
   * not a hint. Expired leases are swept here, so a request that never came
   * back is refunded without anyone asking.
   */
  claim(input: {
    counterKey: string;
    leaseKey: string;
    cap: number;
    leaseMs: number;
    id: string;
    ttlMs: number;
    now: number;
  }): Promise<ClaimResult>;
  /** Gives the slot back and drops the lease; a lease already swept is a no-op. */
  release(input: { counterKey: string; leaseKey: string; id: string; now: number }): Promise<number>;
  /**
   * Keeps the slot for the rest of the day: the generation happened, so the
   * lease stops being provisional. Without this a successful print would be
   * refunded by its own expiry and the daily ceiling would become a rate limit.
   */
  confirm(input: { counterKey: string; leaseKey: string; id: string }): Promise<number>;
  /** Current usage, after sweeping the leases that ran out unconfirmed. */
  read(input: { counterKey: string; leaseKey: string; now: number }): Promise<number>;
};

const counters = new Map<string, { count: number; resetAt: number }>();
/** counterKey → lease id → when it stops holding the slot. */
const leases = new Map<string, Map<string, number>>();

/**
 * A lease that ran out without a result belongs to a generation that never
 * finished: its increment goes back here, which is what makes a dead function
 * self-healing.
 */
function sweep(now: number): void {
  for (const [counterKey, held] of leases) {
    for (const [id, expiresAt] of held) {
      if (expiresAt > now) continue;

      held.delete(id);

      const entry = counters.get(counterKey);
      if (entry && entry.resetAt > now) entry.count = Math.max(0, entry.count - 1);
    }

    if (held.size === 0) leases.delete(counterKey);
  }
}

const memoryStore: Store = {
  shared: false,
  async claim({ counterKey, cap, leaseMs, id, ttlMs, now }) {
    sweep(now);

    const entry = counters.get(counterKey);
    const live = entry && entry.resetAt > now ? entry : null;
    const used = live ? live.count : 0;

    /* Node runs this function to completion, so read-then-write cannot interleave. */
    if (used >= cap) return { allowed: false, used };

    counters.set(counterKey, { count: used + 1, resetAt: live ? live.resetAt : now + ttlMs });

    const held = leases.get(counterKey) ?? new Map<string, number>();
    held.set(id, now + leaseMs);
    leases.set(counterKey, held);

    return { allowed: true, used: used + 1 };
  },
  async release({ counterKey, id, now }) {
    sweep(now);

    /* Not in the set means it was already swept as expired: nothing left to undo. */
    if (!leases.get(counterKey)?.delete(id)) return counters.get(counterKey)?.count ?? 0;

    const entry = counters.get(counterKey);
    if (!entry || entry.resetAt <= now) return 0;

    entry.count = Math.max(0, entry.count - 1);
    return entry.count;
  },
  async confirm({ counterKey, id }) {
    /* Dropping the lease without touching the counter is the whole point. */
    for (const [key, held] of leases) {
      if (held.delete(id) && held.size === 0 && key === counterKey) leases.delete(key);
    }

    return counters.get(counterKey)?.count ?? 0;
  },
  async read({ counterKey, now }) {
    sweep(now);
    const entry = counters.get(counterKey);
    return entry && entry.resetAt > now ? entry.count : 0;
  },
};

/**
 * The three scripts, each one round trip. Redis runs a script atomically — no
 * other client can look at the counter in the middle — which is why a refusal
 * never writes anything and needs no rollback. The tags at the top identify
 * them for the fake in the tests.
 */
const CLAIM_SCRIPT = `-- bwslab:claim
local expired = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', ARGV[3])
for i = 1, #expired do
  if redis.call('ZREM', KEYS[2], expired[i]) == 1 then
    redis.call('DECR', KEYS[1])
  end
end
local used = tonumber(redis.call('GET', KEYS[1]) or '0')
if used < 0 then
  redis.call('SET', KEYS[1], 0)
  used = 0
end
local cap = tonumber(ARGV[1])
if used >= cap then
  return { 0, used }
end
local taken = redis.call('INCR', KEYS[1])
if taken == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[5])
end
redis.call('ZADD', KEYS[2], tonumber(ARGV[3]) + tonumber(ARGV[2]), ARGV[4])
redis.call('PEXPIRE', KEYS[2], ARGV[5])
return { 1, taken }`;

const RELEASE_SCRIPT = `-- bwslab:release
if redis.call('ZREM', KEYS[2], ARGV[1]) == 1 then
  local left = redis.call('DECR', KEYS[1])
  if left < 0 then
    redis.call('SET', KEYS[1], 0)
    return 0
  end
  return left
end
return tonumber(redis.call('GET', KEYS[1]) or '0')`;

const CONFIRM_SCRIPT = `-- bwslab:confirm
redis.call('ZREM', KEYS[2], ARGV[1])
return tonumber(redis.call('GET', KEYS[1]) or '0')`;

const READ_SCRIPT = `-- bwslab:read
local expired = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', ARGV[1])
for i = 1, #expired do
  if redis.call('ZREM', KEYS[2], expired[i]) == 1 then
    redis.call('DECR', KEYS[1])
  end
end
local used = tonumber(redis.call('GET', KEYS[1]) or '0')
if used < 0 then
  redis.call('SET', KEYS[1], 0)
  return 0
end
return used`;

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

  const number = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return {
    shared: true,
    async claim({ counterKey, leaseKey, cap, leaseMs, id, ttlMs, now }) {
      const result = await call([
        "EVAL",
        CLAIM_SCRIPT,
        2,
        counterKey,
        leaseKey,
        String(cap),
        String(leaseMs),
        String(now),
        id,
        String(ttlMs),
      ]);

      if (!Array.isArray(result) || result.length < 2) throw new Error("risposta inattesa dal contatore");

      return { allowed: Number(result[0]) === 1, used: number(result[1]) };
    },
    async release({ counterKey, leaseKey, id }) {
      return number(await call(["EVAL", RELEASE_SCRIPT, 2, counterKey, leaseKey, id]));
    },
    async confirm({ counterKey, leaseKey, id }) {
      return number(await call(["EVAL", CONFIRM_SCRIPT, 2, counterKey, leaseKey, id]));
    },
    async read({ counterKey, leaseKey, now }) {
      return number(await call(["EVAL", READ_SCRIPT, 2, counterKey, leaseKey, String(now)]));
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

function leaseKeyFor(counterKey: string): string {
  return `${counterKey}:leases`;
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

function newLeaseId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `lease-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Read-only view for the status endpoint: costs nothing, spends nothing. */
export async function currentBudget(scope: SpendScope = "prompt"): Promise<Budget> {
  const now = Date.now();
  const store = configuredStore();
  const cap = configuredCap();

  if (cap === 0) return unlimited(store, now);

  const counterKey = dayKey(now, scope);
  let used = 0;

  try {
    used = await store.read({ counterKey, leaseKey: leaseKeyFor(counterKey), now });
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
   * the slot was taken on, not the day the failure lands: a generation that
   * starts at 23:59 and fails at 00:01 must not refund tomorrow's counter,
   * which would hand out a free generation on top of a spent one.
   */
  refund(): Promise<void>;
  /**
   * Called when the image exists. From here the slot is spent, not provisional:
   * its lease can no longer expire into a refund.
   */
  confirm(): Promise<void>;
};

/** Nothing was taken, so there is nothing to give back. */
const nothingToRefund = async (): Promise<void> => undefined;
const nothingToConfirm = async (): Promise<void> => undefined;

/**
 * Called right before a generation. `allowed: false` means the provider is
 * never contacted, so nothing is billed.
 *
 * The returned reservation holds its slot until `refund` runs or until the
 * lease expires: whichever comes first. That is the whole safety net for a
 * function the platform kills mid-generation — nobody has to report anything.
 */
export async function reserveGeneration(scope: SpendScope = "prompt"): Promise<Reservation> {
  const now = Date.now();
  const store = configuredStore();
  const cap = configuredCap();

  if (cap === 0) {
    return { allowed: true, budget: unlimited(store, now), refund: nothingToRefund, confirm: nothingToConfirm };
  }

  /* Captured here, once: the day is a property of the reservation. */
  const counterKey = dayKey(now, scope);
  const leaseKey = leaseKeyFor(counterKey);
  const id = newLeaseId();

  let claim: ClaimResult;
  try {
    claim = await store.claim({ counterKey, leaseKey, cap, leaseMs: LEASE_MS, id, ttlMs: DAY_MS, now });
  } catch (error) {
    /*
     * A dead counter must not take the page down: the provider's own quota is
     * still the hard stop. Say it out loud in the log instead of hiding it.
     */
    console.error(JSON.stringify({ event: "bwslab.budget", ok: false, reason: "store", error: String(error) }));
    return { allowed: true, budget: unlimited(store, now), refund: nothingToRefund, confirm: nothingToConfirm };
  }

  const refund = async (): Promise<void> => {
    try {
      await store.release({ counterKey, leaseKey, id, now: Date.now() });
    } catch (error) {
      console.error(JSON.stringify({ event: "bwslab.budget", ok: false, reason: "refund", error: String(error) }));
    }
  };

  const confirm = async (): Promise<void> => {
    try {
      await store.confirm({ counterKey, leaseKey, id });
    } catch (error) {
      /* Worst case the lease expires and the slot comes back: the safe direction. */
      console.error(JSON.stringify({ event: "bwslab.budget", ok: false, reason: "confirm", error: String(error) }));
    }
  };

  /* Nothing was written when the store refused, so there is nothing to undo. */
  if (!claim.allowed) {
    return { allowed: false, budget: withUsage(cap, claim.used, store, now), refund: nothingToRefund, confirm: nothingToConfirm };
  }

  return { allowed: true, budget: withUsage(cap, claim.used, store, now), refund, confirm };
}

export function budgetMessage(budget: Budget): string {
  /* The refusal itself is an attempt already counted, so show the ceiling, not the overshoot. */
  const shown = Math.min(budget.used, budget.cap);
  return `Tetto giornaliero raggiunto (${shown}/${budget.cap}). Nessun addebito: il contatore si azzera alle 00:00 UTC. Prova domani.`;
}
