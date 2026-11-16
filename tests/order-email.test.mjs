import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { orderEmailContent, sendOrderConfirmation } from "../lib/shop/email.ts";
import { claimConfirmation, orderFromRow, releaseConfirmation } from "../lib/shop/orders.ts";

const root = new URL("../", import.meta.url);

const order = {
  id: "BW-2026-0001",
  createdAt: "2026-11-16T10:00:00.000Z",
  status: "paid",
  customer: { firstName: "Daniele", lastName: "M.", email: "cliente@example.com" },
  address: { street: "Via Roma 1", zip: "20100", city: "Milano", province: "MI", country: "Italia" },
  shipping: "express",
  lines: [
    { sku: "BW-T01", name: "Serpenti", detail: "T-shirt 240 g · M", size: "M", quantity: 1, unitPrice: 49, total: 49 },
    { sku: "BW-T02", name: "Ragno", detail: "T-shirt 240 g · L", size: "L", quantity: 2, unitPrice: 55, total: 110 },
  ],
  subtotal: 159,
  shippingCost: 12,
  total: 171,
  paymentProvider: "stripe",
  paymentRef: "pi_123",
};

function withEnv(values) {
  const saved = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

test("writes a confirmation with the products, the shipping and the total", () => {
  const { subject, html, text } = orderEmailContent(order);

  assert.match(subject, /BW-2026-0001/);
  assert.match(subject, /confermato/i);

  for (const content of [html, text]) {
    assert.match(content, /Serpenti/);
    assert.match(content, /Ragno/);
    assert.match(content, /171/);
    assert.match(content, /Corriere espresso/);
    assert.match(content, /Via Roma 1/);
  }

  assert.match(html, /Daniele/);
  /* Nessun importo del catalogo viene ricalcolato qui: si stampa quello dell'ordine. */
  assert.match(text, /Spedizione \(Corriere espresso\): 12/);
});

test("escapes whatever the customer or the catalog puts in the email", () => {
  const nasty = {
    ...order,
    customer: { ...order.customer, firstName: "<script>alert(1)</script>" },
    lines: [{ ...order.lines[0], name: "Ragno & Serpenti" }],
  };

  const { html } = orderEmailContent(nasty);

  assert.doesNotMatch(html, /<script>/, "il nome del cliente è finito nell'HTML senza escape");
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Ragno &amp; Serpenti/);
});

test("does not send anything when the provider is not configured", async () => {
  const restore = withEnv({ RESEND_API_KEY: undefined, ORDER_FROM_EMAIL: undefined, ORDER_REPLY_TO: undefined });
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("non doveva essere chiamato");
  };

  try {
    const result = await sendOrderConfirmation({ ...order, id: "BW-NOKEY-01" });
    assert.equal(result.sent, false);
    assert.equal(result.reason, "not-configured");
    assert.equal(calls, 0, "senza chiave non deve uscire nessuna richiesta");
  } finally {
    globalThis.fetch = realFetch;
    restore();
  }
});

test("posts the email once, with the key in the header and never in the body", async () => {
  const restore = withEnv({
    RESEND_API_KEY: "re_chiave_di_prova",
    ORDER_FROM_EMAIL: "Bleachwears <ordini@bleachwears.test>",
    ORDER_REPLY_TO: "ciao@bleachwears.test",
  });
  const realFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
  };

  try {
    const result = await sendOrderConfirmation({ ...order, id: "BW-SENT-01" });
    assert.equal(result.sent, true);
    assert.equal(requests.length, 1);

    const [request] = requests;
    assert.equal(request.url, "https://api.resend.com/emails");
    assert.equal(request.init.headers.Authorization, "Bearer re_chiave_di_prova");

    const body = JSON.parse(request.init.body);
    assert.equal(body.from, "Bleachwears <ordini@bleachwears.test>");
    assert.deepEqual(body.to, ["cliente@example.com"]);
    assert.equal(body.reply_to, "ciao@bleachwears.test");
    assert.match(body.subject, /BW-SENT-01/);
    assert.match(body.html, /Serpenti/);
    assert.equal(JSON.stringify(body).includes("re_chiave_di_prova"), false, "la chiave è finita nel corpo");

    /* Un secondo evento Stripe per lo stesso ordine non deve mandare un'altra email. */
    const again = await sendOrderConfirmation({ ...order, id: "BW-SENT-01" });
    assert.equal(again.sent, true);
    assert.equal(again.reason, "duplicate");
    assert.equal(requests.length, 1, "la conferma è partita due volte");
  } finally {
    globalThis.fetch = realFetch;
    restore();
  }
});

test("reads an order back from the database row the webhook receives", () => {
  const loaded = orderFromRow({
    id: "BW-2026-0002",
    status: "paid",
    customer: { firstName: "Sara", email: "sara@example.com" },
    address: { city: "Torino", country: "Italia" },
    shipping_method: "standard",
    lines: order.lines,
    subtotal_cents: 15900,
    shipping_cents: 600,
    total_cents: 16500,
    payment_provider: "stripe",
    payment_ref: "pi_999",
    created_at: "2026-11-15T09:00:00.000Z",
  });

  assert.equal(loaded.total, 165);
  assert.equal(loaded.shippingCost, 6);
  assert.equal(loaded.subtotal, 159);
  assert.equal(loaded.status, "paid");
  assert.equal(loaded.lines.length, 2);
  assert.equal(loaded.customer.email, "sara@example.com");
});

test("only one delivery of the same payment can take the confirmation", async () => {
  const restore = withEnv({
    NEXT_PUBLIC_SUPABASE_URL: "https://db.stub.local",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-di-prova",
  });
  const realFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    /* La prima PATCH tocca una riga; la seconda non trova più niente da aggiornare. */
    const rows = requests.filter((request) => request.init.method === "PATCH" && request.init.body?.includes("confirmation_sent_at")).length;
    return new Response(JSON.stringify(rows === 1 ? [{ id: "BW-2026-0003" }] : []), { status: 200 });
  };

  try {
    assert.equal(await claimConfirmation("BW-2026-0003"), true, "il primo evento non ha preso in carico la conferma");
    assert.equal(await claimConfirmation("BW-2026-0003"), false, "il secondo evento manderebbe una seconda email");

    const [first] = requests;
    assert.match(first.url, /orders\?id=eq\.BW-2026-0003&confirmation_sent_at=is\.null/, "manca la condizione sulla colonna");
    assert.equal(first.init.method, "PATCH");
    assert.ok(JSON.parse(first.init.body).confirmation_sent_at, "la presa in carico non viene registrata");

    /* Se l'invio fallisce la presa in carico torna libera e il retry può riprovare. */
    const before = requests.length;
    await releaseConfirmation("BW-2026-0003");
    assert.equal(requests.length, before + 1);
    assert.equal(JSON.parse(requests[requests.length - 1].init.body).confirmation_sent_at, null);
  } finally {
    globalThis.fetch = realFetch;
    restore();
  }
});

test("without a database the confirmation is still claimed once per instance", async () => {
  const restore = withEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined });

  try {
    assert.equal(await claimConfirmation("BW-NODB-01"), true);
    assert.equal(await claimConfirmation("BW-NODB-01"), false);
    await releaseConfirmation("BW-NODB-01");
    assert.equal(await claimConfirmation("BW-NODB-01"), true, "dopo il rilascio il tentativo deve poter ripartire");
  } finally {
    restore();
  }
});

test("the Stripe webhook sends the confirmation after marking the order paid", async () => {
  const source = await readFile(new URL("app/api/stripe/webhook/route.ts", root), "utf8");
  const mark = source.indexOf('markOrderStatus(orderId, "paid"');
  const send = source.indexOf("sendOrderConfirmation(order");

  assert.ok(mark > 0, "il webhook non segna l'ordine come pagato");
  assert.ok(send > mark, "la conferma parte prima che l'ordine risulti pagato");
  assert.match(source, /loadOrder\(orderId\)/, "il webhook non rilegge l'ordine, quindi su un'altra istanza non lo trova");

  /* Un evento consegnato due volte non deve mandare due email. */
  const claim = source.indexOf("claimConfirmation(orderId)");
  assert.ok(claim > 0, "il webhook non prende in carico la conferma prima di inviarla");
  assert.ok(source.indexOf("sendOrderConfirmation(", claim) > claim, "l'email parte senza presa in carico");
});
