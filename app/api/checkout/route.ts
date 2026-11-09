import { NextResponse } from "next/server";
import {
  computeTotals,
  money,
  orderReference,
  priceLine,
  type OrderLineInput,
  type PricedLine,
} from "@/lib/shop/catalog";
import { saveOrder, type StoredOrder } from "@/lib/shop/orders";
import { createCheckoutSession } from "@/lib/shop/stripe";

export const runtime = "nodejs";

type CheckoutBody = {
  items?: OrderLineInput[];
  customer?: { firstName?: string; lastName?: string; email?: string; phone?: string };
  address?: { street?: string; zip?: string; city?: string; province?: string; country?: string; notes?: string };
  shipping?: string;
};

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

function siteOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return new URL(request.url).origin;
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
    status: paymentMode === "stripe" ? "payment_pending" : "request_received",
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
    const session = await createCheckoutSession(order, siteOrigin(request));
    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Il pagamento con carta non risponde in questo momento. Nessun importo è stato addebitato: riprova tra poco o scrivici.",
        },
        { status: 502 },
      );
    }
    order.paymentRef = session.id;
    await saveOrder(order);
    return NextResponse.json({
      ok: true,
      mode: "stripe",
      orderId: order.id,
      checkoutUrl: session.url,
      total,
      totals: { subtotal, shipping, total, label: money(total) },
    });
  }

  const stored = await saveOrder(order);
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
