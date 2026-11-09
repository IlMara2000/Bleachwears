/**
 * Every transform is a paid generation, so the route caps how often one client
 * can ask. The window lives in the instance memory: on serverless it is a
 * best-effort guard, not a global quota. Put a shared store in front of it if
 * the site ever gets real traffic.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 6;
const MAX_TRACKED_CLIENTS = 5_000;

const hits = new Map<string, number[]>();

export type LimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export function takeToken(clientId: string, now = Date.now()): LimitResult {
  const recent = (hits.get(clientId) ?? []).filter((at) => now - at < WINDOW_MS);

  if (recent.length >= MAX_PER_WINDOW) {
    const oldest = recent[0];
    hits.set(clientId, recent);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)) };
  }

  recent.push(now);
  hits.set(clientId, recent);

  /* Keep the map from growing forever on a long-lived instance. */
  if (hits.size > MAX_TRACKED_CLIENTS) {
    for (const [key, stamps] of hits) {
      if (!stamps.length || now - stamps[stamps.length - 1] > WINDOW_MS) hits.delete(key);
    }
  }

  return { allowed: true };
}

export function clientIdFrom(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim();
  return ip || "unknown";
}
