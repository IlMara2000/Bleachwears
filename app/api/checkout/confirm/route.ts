import { NextResponse } from "next/server";
import { markOrderStatus } from "@/lib/shop/orders";
import { paymentIntentId, retrieveCheckoutSession, stripeConfigured } from "@/lib/shop/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_ID = /^cs_[A-Za-z0-9_]{8,200}$/;

/* La pagina di ritorno non si fida della query string: chiede a Stripe com'è
   andata davvero la sessione, poi riallinea lo stato dell'ordine. */
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id")?.trim() ?? "";

  if (!SESSION_ID.test(sessionId)) {
    return NextResponse.json({ ok: false, error: "Riferimento di pagamento non valido." }, { status: 400 });
  }
  if (!stripeConfigured()) {
    return NextResponse.json({ ok: false, error: "Pagamento con carta non configurato." }, { status: 503 });
  }

  const lookup = await retrieveCheckoutSession(sessionId);
  if (!lookup.ok) {
    if (lookup.status === 404) {
      return NextResponse.json(
        { ok: false, error: "Non troviamo questo pagamento. Se hai ricevuto la ricevuta via email, l'ordine è salvato." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Il collegamento al pagamento non risponde: riprova tra qualche istante." },
      { status: 502 },
    );
  }

  const session = lookup.session;

  const orderId = session.metadata?.order || session.client_reference_id || "";
  const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";

  if (orderId && paid) {
    await markOrderStatus(orderId, "paid", paymentIntentId(session));
  } else if (orderId && session.status === "expired") {
    await markOrderStatus(orderId, "expired");
  }

  return NextResponse.json(
    {
      ok: true,
      orderId,
      paid,
      state: session.status,
      paymentStatus: session.payment_status,
      total: (session.amount_total ?? 0) / 100,
      currency: session.currency,
      email: session.customer_details?.email ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
