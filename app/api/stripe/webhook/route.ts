import { NextResponse } from "next/server";
import { sendOrderConfirmation } from "@/lib/shop/email";
import { claimConfirmation, loadOrder, markOrderStatus, releaseConfirmation } from "@/lib/shop/orders";
import { paymentIntentId, verifyStripeSignature, type StripeSession } from "@/lib/shop/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StripeEvent = {
  id?: string;
  type?: string;
  data?: { object?: StripeSession & { metadata?: Record<string, string> | null } };
};

/* Stripe chiama qui quando il pagamento si chiude. La firma è obbligatoria:
   senza segreto configurato l'endpoint rifiuta tutto invece di fidarsi. */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  if (!secret) {
    console.error("Stripe webhook: STRIPE_WEBHOOK_SECRET mancante");
    return NextResponse.json({ ok: false, error: "Webhook non configurato." }, { status: 503 });
  }

  const payload = await request.text();
  if (!verifyStripeSignature(payload, request.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ ok: false, error: "Firma non valida." }, { status: 401 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return NextResponse.json({ ok: false, error: "Evento illeggibile." }, { status: 400 });
  }

  const session = event.data?.object;
  const orderId = session?.metadata?.order || session?.client_reference_id || "";

  if (orderId) {
    const paid = session?.payment_status === "paid" || session?.payment_status === "no_payment_required";

    if (paid && (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded")) {
      await markOrderStatus(orderId, "paid", session ? paymentIntentId(session) : null);

      /*
       * La conferma parte qui e non nella pagina di ritorno: chi paga con carta
       * non torna sempre sul sito, e un ordine pagato senza email è un cliente
       * che scrive "ho pagato, e adesso?".
       */
      const order = await loadOrder(orderId);

      if (!order) {
        console.warn(JSON.stringify({ event: "order.email", ok: false, reason: "order-missing", order: orderId }));
      } else if (await claimConfirmation(orderId)) {
        /*
         * La conferma è presa in carico da un solo evento: Stripe può consegnare
         * lo stesso pagamento più volte, e due email per un ordine sono un
         * difetto visibile al cliente.
         */
        const sent = await sendOrderConfirmation(order, session?.customer_details?.email ?? null);

        /* Nessuna email partita: la presa in carico torna libera per il retry. */
        if (!sent.sent && sent.reason !== "duplicate") await releaseConfirmation(orderId);
      }
    } else if (event.type === "checkout.session.expired") {
      await markOrderStatus(orderId, "expired");
    }
  }

  return NextResponse.json({ received: true });
}
