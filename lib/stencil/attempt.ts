/**
 * The browser half of the request id.
 *
 * The server keeps the id together with what happened to it — pending, or done
 * with the image — and answers a repeat with that image instead of generating
 * again. For that to work the id must outlive the click: a retry after a timeout
 * is a new render, often a new component, sometimes a reloaded page. So it is
 * stored (sessionStorage, per page and per tab) with the attempt instead of
 * living in a ref that disappears with the component.
 *
 * It is cleared only when the attempt produced its image. A failed attempt keeps
 * its id on purpose: the generation may have finished on the server after the
 * browser gave up, and the retry must collect that image rather than buy another.
 */

/** Two hours: longer than any generation, shorter than "come back tomorrow". */
export const ATTEMPT_TTL_MS = 2 * 60 * 60 * 1000;

/** The page's own slot: the lab and the prompt press must not share an id. */
export type AttemptScope = "lab" | "prompt";

type Stored = { id: string; at: number };

const key = (scope: AttemptScope) => `bwslab:attempt:${scope}`;

/** Same rule the API applies: a short opaque token, nothing else. */
const ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/** Storage can be absent (server render) or throw (private mode): never fatal. */
function storage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** `randomUUID` needs a secure context; a plain http host may not have one. */
export function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The id of the attempt still in flight for this page, if it is still ours. */
export function attemptId(scope: AttemptScope, now: number = Date.now()): string | null {
  /* Reading throws too when storage is blocked, not only getting hold of it. */
  let raw: string | null;
  try {
    raw = storage()?.getItem(key(scope)) ?? null;
  } catch {
    return null;
  }

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (typeof parsed.id !== "string" || !ID_PATTERN.test(parsed.id)) return null;

    const at = Number(parsed.at);
    if (!Number.isFinite(at) || now - at > ATTEMPT_TTL_MS) return null;

    return parsed.id;
  } catch {
    return null;
  }
}

/**
 * The id to send now: the one already in flight, or a fresh one for a new
 * attempt. Calling it twice without finishing returns the same id, which is
 * what makes a retry a retry and not a second purchase.
 */
export function startAttempt(scope: AttemptScope, now: number = Date.now()): string {
  const pending = attemptId(scope, now);
  if (pending) return pending;

  const id = newRequestId();

  try {
    storage()?.setItem(key(scope), JSON.stringify({ id, at: now } satisfies Stored));
  } catch {
    /* Without storage the id lives for this call only: worse, not broken. */
  }

  return id;
}

/** Called when the attempt produced its image: the next click is a new order. */
export function finishAttempt(scope: AttemptScope): void {
  try {
    storage()?.removeItem(key(scope));
  } catch {
    /* nothing to clean up if storage is unavailable */
  }
}
