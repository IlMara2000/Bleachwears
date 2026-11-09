import type { PricedLine } from "./catalog";

export type OrderStatus = "request_received" | "payment_pending" | "paid" | "expired" | "cancelled";

export type StoredOrder = {
  id: string;
  createdAt: string;
  status: OrderStatus;
  customer: { firstName?: string; lastName?: string; email?: string; phone?: string };
  address: { street?: string; zip?: string; city?: string; province?: string; country?: string; notes?: string };
  shipping: string;
  lines: PricedLine[];
  subtotal: number;
  shippingCost: number;
  total: number;
  paymentProvider: "stripe" | "manual";
  paymentRef: string | null;
};

/* Promemoria dell'ultima istanza viva: su Vercel non sostituisce il database,
   serve solo a non perdere l'ordine quando la service role key non è impostata. */
const memoryOrders = new Map<string, StoredOrder>();

export function rememberOrder(order: StoredOrder) {
  memoryOrders.set(order.id, order);
}

export function recallOrder(id: string) {
  return memoryOrders.get(id) ?? null;
}

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

export async function saveOrder(order: StoredOrder) {
  rememberOrder(order);
  const db = supabase();
  if (!db) return false;

  try {
    const response = await fetch(`${db.url}/rest/v1/orders?on_conflict=id`, {
      method: "POST",
      headers: {
        apikey: db.key,
        Authorization: `Bearer ${db.key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        id: order.id,
        status: order.status,
        customer: order.customer,
        address: order.address,
        shipping_method: order.shipping,
        lines: order.lines,
        subtotal_cents: Math.round(order.subtotal * 100),
        shipping_cents: Math.round(order.shippingCost * 100),
        total_cents: Math.round(order.total * 100),
        payment_provider: order.paymentProvider,
        payment_ref: order.paymentRef,
      }),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Aggiorna solo lo stato: la usano la conferma del ritorno e il webhook. */
export async function markOrderStatus(
  id: string,
  status: OrderStatus,
  paymentRef?: string | null,
) {
  const local = memoryOrders.get(id);
  if (local) {
    local.status = status;
    if (paymentRef !== undefined) local.paymentRef = paymentRef;
  }

  const db = supabase();
  if (!db) return false;

  try {
    const response = await fetch(`${db.url}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        apikey: db.key,
        Authorization: `Bearer ${db.key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        status,
        ...(paymentRef !== undefined ? { payment_ref: paymentRef } : {}),
      }),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}
