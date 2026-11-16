/**
 * A retried generation must not cost a second slot.
 *
 * The client sends an id with every attempt and keeps it across retries. The
 * first attempt claims the id and runs; a retry after a timeout either gets the
 * image that attempt produced (nothing spent twice) or, while the first one is
 * still working, a 409 instead of a second generation.
 *
 * The store is per instance memory, like the spend guard: on serverless a retry
 * may land on another instance and start over. That is the safe failure — the
 * other direction, an entry that never expires, would lock the press for the
 * rest of the day.
 */

/** Header the page and the API agree on. Lowercase: Headers normalises names. */
export const REQUEST_ID_HEADER = "x-stencil-request-id";

/** A request that never reported back stops blocking retries after this. */
const PENDING_TTL_MS = 10 * 60 * 1000;

/** The image stays available for re-download without another generation. */
const DONE_TTL_MS = 30 * 60 * 1000;

/** Small on purpose: this is a retry cache, not a gallery. */
const MAX_ENTRIES = 16;

export type StoredImage = { bytes: Uint8Array; mimeType: string };

type Entry =
  | { state: "pending"; at: number }
  | { state: "done"; at: number; image: StoredImage };

export type Claim =
  | { mode: "run" }
  | { mode: "reuse"; image: StoredImage }
  | { mode: "busy"; retryAfterSeconds: number };

const entries = new Map<string, Entry>();

/**
 * Ids come from the browser, so they are untrusted text: accept only a short
 * opaque token and drop everything else instead of using it as a key.
 */
export function requestIdFrom(request: Request): string | null {
  const value = request.headers.get(REQUEST_ID_HEADER)?.trim();

  if (!value || value.length < 8 || value.length > 128) return null;

  return /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
}

function ttlFor(entry: Entry): number {
  return entry.state === "pending" ? PENDING_TTL_MS : DONE_TTL_MS;
}

/** Drops dead entries and keeps the map from growing without bound. */
function prune(now: number): void {
  for (const [id, entry] of entries) {
    if (now - entry.at > ttlFor(entry)) entries.delete(id);
  }

  while (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next();
    if (oldest.done) break;
    entries.delete(oldest.value);
  }
}

/**
 * Called before the rate limit and the spend guard: a stored result costs
 * nothing, so it must not be refused for either.
 */
export function claimRequest(id: string | null): Claim {
  if (!id) return { mode: "run" };

  const now = Date.now();
  prune(now);

  const entry = entries.get(id);

  if (!entry) {
    entries.set(id, { state: "pending", at: now });
    return { mode: "run" };
  }

  if (entry.state === "done") return { mode: "reuse", image: entry.image };

  const age = now - entry.at;
  if (age < PENDING_TTL_MS) {
    return { mode: "busy", retryAfterSeconds: Math.max(1, Math.ceil((PENDING_TTL_MS - age) / 1000)) };
  }

  /* A previous attempt died silently: let this one run instead of blocking. */
  entries.set(id, { state: "pending", at: now });
  return { mode: "run" };
}

/** Keeps the finished image under its id, so the retry returns it as-is. */
export function completeRequest(id: string | null, image: StoredImage): void {
  if (!id) return;

  entries.set(id, { state: "done", at: Date.now(), image });
}

/**
 * A failure both refunds the slot and frees the id: retrying a request that
 * produced nothing must be allowed to try again.
 */
export function failRequest(id: string | null): void {
  if (!id) return;

  entries.delete(id);
}

/** Tests only: the cache is process state and must not leak between cases. */
export function forgetAllRequests(): void {
  entries.clear();
}
