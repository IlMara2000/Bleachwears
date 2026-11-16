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

/** La riga come sta in PostgREST: importi in centesimi, nomi in snake_case. */
type OrderRow = {
  id: string;
  status: OrderStatus;
  customer: StoredOrder["customer"] | null;
  address: StoredOrder["address"] | null;
  shipping_method: string | null;
  lines: PricedLine[] | null;
  subtotal_cents: number | null;
  shipping_cents: number | null;
  total_cents: number | null;
  payment_provider?: string | null;
  payment_ref?: string | null;
  created_at?: string | null;
};

export function orderFromRow(row: OrderRow): StoredOrder {
  return {
    id: row.id,
    createdAt: row.created_at ?? new Date(0).toISOString(),
    status: row.status,
    customer: row.customer ?? {},
    address: row.address ?? {},
    shipping: row.shipping_method ?? "standard",
    lines: Array.isArray(row.lines) ? row.lines : [],
    subtotal: (row.subtotal_cents ?? 0) / 100,
    shippingCost: (row.shipping_cents ?? 0) / 100,
    total: (row.total_cents ?? 0) / 100,
    paymentProvider: row.payment_provider === "manual" ? "manual" : "stripe",
    paymentRef: row.payment_ref ?? null,
  };
}

/**
 * Il webhook di Stripe può arrivare su un'istanza diversa da quella che ha
 * creato l'ordine: senza questa lettura la conferma partirebbe solo per caso.
 * Se il database non è configurato o non risponde si ricade sul promemoria in
 * memoria, che in locale basta.
 */
export async function loadOrder(id: string): Promise<StoredOrder | null> {
  const db = supabase();
  if (!db) return recallOrder(id);

  try {
    const response = await fetch(`${db.url}/rest/v1/orders?id=eq.${encodeURIComponent(id)}&select=*`, {
      headers: { apikey: db.key, Authorization: `Bearer ${db.key}` },
      cache: "no-store",
    });

    if (!response.ok) return recallOrder(id);

    const rows = (await response.json()) as OrderRow[];
    return rows.length > 0 ? orderFromRow(rows[0]) : recallOrder(id);
  } catch {
    return recallOrder(id);
  }
}
