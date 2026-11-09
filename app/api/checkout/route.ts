import { NextResponse } from "next/server";
import {
  computeTotals,
  getShippingMethod,
  money,
  orderReference,
  priceLine,
  type OrderLineInput,
  type PricedLine,
} from "@/lib/shop/catalog";

export const runtime = "nodejs";

type CheckoutBody = {
  items?: OrderLineInput[];
  customer?: { firstName?: string; lastName?: string; email?: string; phone?: string };
  address?: { street?: string; zip?: string; city?: string; province?: string; country?: string; notes?: string };
  shipping?: string;
};

type StoredOrder = {
  id: string;
  createdAt: string;
  status: string;
  customer: CheckoutBody["customer"];
  address: CheckoutBody["address"];
  shipping: string;
  lines: PricedLine[];
  subtotal: number;
  shippingCost: number;
  total: number;
  paymentProvider: string;
  paymentRef: string | null;
};

/* Le richieste restano in memoria quando Supabase non è configurato: è una rete
   di sicurezza per non perdere l'ordine durante la fase di collegamento. */
const memoryOrders = new Map<string, StoredOrder>();
const attempts = new Map<string, { count: number; reset: number }>();

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const ZIP = /^\d{5}$/;

function text(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function limited(ip: string) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.reset < now) {
    attempts.set(ip, { count: 1, reset: now + 10 * 60 * 1000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 8;
}

async function persist(order: StoredOrder) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  memoryOrders.set(order.id, order);
  if (!url || !key) return false;

  try {
    const response = await fetch(`${url}/rest/v1/orders`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
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
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function createStripeSession(order: StoredOrder, origin: string) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;

  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", `${origin}/?ordine=${order.id}&stato=pagato#checkout`);
  body.set("cancel_url", `${origin}/?ordine=${order.id}&stato=annullato#checkout`);
  body.set("customer_email", order.customer?.email ?? "");
  body.set("client_reference_id", order.id);
  body.set("metadata[order]", order.id);
  body.set("payment_method_types[0]", "card");

  order.lines.forEach((line, index) => {
    body.set(`line_items[${index}][quantity]`, String(line.quantity));
    body.set(`line_items[${index}][price_data][currency]`, "eur");
    body.set(`line_items[${index}][price_data][unit_amount]`, String(Math.round(line.unitPrice * 100)));
    body.set(`line_items[${index}][price_data][product_data][name]`, `${line.name}${line.size ? ` · ${line.size}` : ""}`);
    body.set(`line_items[${index}][price_data][product_data][description]`, line.detail.slice(0, 140));
  });

  if (order.shippingCost > 0) {
    const method = getShippingMethod(order.shipping);
    body.set(`line_items[${order.lines.length}][quantity]`, "1");
    body.set(`line_items[${order.lines.length}][price_data][currency]`, "eur");
    body.set(`line_items[${order.lines.length}][price_data][unit_amount]`, String(Math.round(order.shippingCost * 100)));
    body.set(`line_items[${order.lines.length}][price_data][product_data][name]`, `Spedizione · ${method.label}`);
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Stripe checkout error", response.status, detail.slice(0, 400));
    return null;
  }

  const session = (await response.json()) as { id?: string; url?: string };
  return session.url ? { url: session.url, id: session.id ?? "" } : null;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) {
    return NextResponse.json({ ok: false, error: "Troppe richieste: riprova tra qualche minuto." }, { status: 429 });
  }

  let body: CheckoutBody;
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Richiesta non valida." }, { status: 400 });
  }

  const rawItems = Array.isArray(body.items) ? body.items.slice(0, 20) : [];
  if (!rawItems.length) {
    return NextResponse.json({ ok: false, error: "Il carrello è vuoto." }, { status: 400 });
  }

  const lines: PricedLine[] = [];
  for (const item of rawItems) {
    const priced = priceLine({
      sku: text(item?.sku, 40),
      size: item?.size,
      quantity: item?.quantity,
      options: item?.options,
    });
    if (!priced) {
      return NextResponse.json({ ok: false, error: "Nel carrello c'è un articolo non disponibile." }, { status: 400 });
    }
    lines.push(priced);
  }

  const shippingId = text(body.shipping, 20) || "standard";
  if (!["standard", "express", "pickup"].includes(shippingId)) {
    return NextResponse.json({ ok: false, error: "Spedizione non valida." }, { status: 400 });
  }

  const customer = {
    firstName: text(body.customer?.firstName, 60),
    lastName: text(body.customer?.lastName, 60),
    email: text(body.customer?.email, 160).toLowerCase(),
    phone: text(body.customer?.phone, 40),
  };
  const address = {
    street: text(body.address?.street, 160),
    zip: text(body.address?.zip, 10),
    city: text(body.address?.city, 80),
    province: text(body.address?.province, 4).toUpperCase(),
    country: text(body.address?.country, 60) || "Italia",
    notes: text(body.address?.notes, 400),
  };

  const problems: string[] = [];
  if (customer.firstName.length < 2) problems.push("nome");
  if (customer.lastName.length < 2) problems.push("cognome");
  if (!EMAIL.test(customer.email)) problems.push("email");
  if (shippingId !== "pickup") {
    if (address.street.length < 4) problems.push("indirizzo");
    if (!ZIP.test(address.zip)) problems.push("CAP");
    if (address.city.length < 2) problems.push("città");
    if (address.province.length !== 2) problems.push("provincia");
  }
  if (problems.length) {
    return NextResponse.json(
      { ok: false, error: `Controlla questi campi: ${problems.join(", ")}.` },
      { status: 422 },
    );
  }

  const { subtotal, shipping, total } = computeTotals(lines, shippingId);
  const paymentMode = process.env.STRIPE_SECRET_KEY ? "stripe" : "manual";

  const order: StoredOrder = {
    id: orderReference(),
    createdAt: new Date().toISOString(),
    status: paymentMode === "stripe" ? "awaiting_payment" : "request_received",
    customer,
    address,
    shipping: shippingId,
    lines,
    subtotal,
    shippingCost: shipping,
    total,
    paymentProvider: paymentMode,
    paymentRef: null,
  };

  if (paymentMode === "stripe") {
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || new URL(request.url).origin;
    const session = await createStripeSession(order, origin);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "Il pagamento non è raggiungibile in questo momento. Riprova tra poco." },
        { status: 502 },
      );
    }
    order.paymentRef = session.id;
    order.status = "payment_pending";
    await persist(order);
    return NextResponse.json({
      ok: true,
      mode: "stripe",
      orderId: order.id,
      checkoutUrl: session.url,
      total,
      totals: { subtotal, shipping, total, label: money(total) },
    });
  }

  const stored = await persist(order);
  return NextResponse.json({
    ok: true,
    mode: "manual",
    orderId: order.id,
    stored,
    total,
    totals: { subtotal, shipping, total, label: money(total) },
    message:
      "Ordine registrato. Il pagamento con carta non è ancora attivo: nessun importo è stato addebitato, ti ricontattiamo sull'email indicata.",
  });
}
