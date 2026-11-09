import { createHmac, timingSafeEqual } from "node:crypto";
import { getShippingMethod } from "./catalog";
import type { StoredOrder } from "./orders";

const API = "https://api.stripe.com/v1";

export function stripeKey() {
  return process.env.STRIPE_SECRET_KEY?.trim() ?? "";
}

export function stripeConfigured() {
  return stripeKey().length > 0;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${stripeKey()}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

async function readError(response: Response) {
  const text = await response.text();
  return `${response.status} ${text.slice(0, 400)}`;
}

/**
 * Costruisce la sessione Stripe dai prezzi già calcolati sul server.
 * L'URL di ritorno porta il session_id: la conferma in pagina viene poi
 * verificata interrogando Stripe, non fidandosi della query string.
 */
export async function createCheckoutSession(order: StoredOrder, origin: string) {
  const key = stripeKey();
  if (!key) return null;

  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("locale", "it");
  body.set("customer_email", order.customer.email ?? "");
  body.set("client_reference_id", order.id);
  body.set("metadata[order]", order.id);
  body.set("payment_intent_data[metadata][order]", order.id);
  body.set("payment_intent_data[description]", `Bleachwears · ${order.id}`);
  body.set("payment_method_types[0]", "card");
  body.set("success_url", `${origin}/?ordine=${order.id}&stato=pagato&session_id={CHECKOUT_SESSION_ID}#checkout`);
  body.set("cancel_url", `${origin}/?ordine=${order.id}&stato=annullato#checkout`);

  order.lines.forEach((line, index) => {
    body.set(`line_items[${index}][quantity]`, String(line.quantity));
    body.set(`line_items[${index}][price_data][currency]`, "eur");
    body.set(`line_items[${index}][price_data][unit_amount]`, String(Math.round(line.unitPrice * 100)));
    body.set(
      `line_items[${index}][price_data][product_data][name]`,
      `${line.name}${line.size ? ` · ${line.size}` : ""}`,
    );
    body.set(`line_items[${index}][price_data][product_data][description]`, line.detail.slice(0, 140));
  });

  if (order.shippingCost > 0) {
    const index = order.lines.length;
    const method = getShippingMethod(order.shipping);
    body.set(`line_items[${index}][quantity]`, "1");
    body.set(`line_items[${index}][price_data][currency]`, "eur");
    body.set(`line_items[${index}][price_data][unit_amount]`, String(Math.round(order.shippingCost * 100)));
    body.set(`line_items[${index}][price_data][product_data][name]`, `Spedizione · ${method.label}`);
  }

  /* URLSearchParams codifica le graffe: Stripe deve ricevere il segnaposto
     {CHECKOUT_SESSION_ID} in chiaro per sostituirlo. */
  const payload = body.toString().replaceAll("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}");

  try {
    const response = await fetch(`${API}/checkout/sessions`, {
      method: "POST",
      headers: { ...authHeaders(), "Idempotency-Key": order.id },
      body: payload,
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("Stripe checkout session failed", await readError(response));
      return null;
    }

    const session = (await response.json()) as { id?: string; url?: string };
    return session.url && session.id ? { url: session.url, id: session.id } : null;
  } catch (error) {
    console.error("Stripe checkout session unreachable", error);
    return null;
  }
}

export type StripeSession = {
  id: string;
  status: string | null;
  payment_status: string | null;
  amount_total: number | null;
  currency: string | null;
  payment_intent: string | { id?: string } | null;
  customer_details: { email?: string | null } | null;
  metadata: Record<string, string> | null;
  client_reference_id: string | null;
};

export type SessionLookup =
  | { ok: true; session: StripeSession }
  | { ok: false; status: number };

export async function retrieveCheckoutSession(id: string): Promise<SessionLookup> {
  if (!stripeConfigured()) return { ok: false, status: 503 };

  try {
    const response = await fetch(`${API}/checkout/sessions/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${stripeKey()}` },
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("Stripe session retrieve failed", await readError(response));
      return { ok: false, status: response.status };
    }
    return { ok: true, session: (await response.json()) as StripeSession };
  } catch (error) {
    console.error("Stripe session retrieve unreachable", error);
    return { ok: false, status: 0 };
  }
}

export function paymentIntentId(session: StripeSession) {
  if (!session.payment_intent) return null;
  return typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id ?? null;
}

/**
 * Verifica l'intestazione `stripe-signature` come documentato da Stripe:
 * HMAC-SHA256 su "<timestamp>.<payload>" con la chiave segreta del webhook.
 */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
) {
  if (!header || !secret) return false;

  const parts = header.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0) return false;

  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - seconds) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return signatures.some((signature) => {
    const buffer = Buffer.from(signature, "utf8");
    return buffer.length === expectedBuffer.length && timingSafeEqual(buffer, expectedBuffer);
  });
}
