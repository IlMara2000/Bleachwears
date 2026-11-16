import { getShippingMethod, money } from "./catalog.ts";
import type { StoredOrder } from "./orders.ts";

/**
 * La conferma d'ordine, in un file solo.
 *
 * L'invio parla l'API HTTP del provider (POST /emails con una chiave), quindi
 * non aggiunge dipendenze e funziona sia su Node sia su un runtime edge. Se la
 * chiave non c'è, l'ordine non si rompe: si registra un avviso e si prosegue,
 * perché un'email mancante non deve mai far fallire un pagamento riuscito.
 */

const ENDPOINT = "https://api.resend.com/emails";

/** Il tetto per un invio: oltre questo, meglio rinunciare che bloccare il webhook. */
const TIMEOUT_MS = 8_000;

type Settings = { key: string; from: string; replyTo?: string };

function settings(): Settings | null {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.ORDER_FROM_EMAIL?.trim();
  if (!key || !from) return null;

  const replyTo = process.env.ORDER_REPLY_TO?.trim();
  return replyTo ? { key, from, replyTo } : { key, from };
}

export function emailConfigured(): boolean {
  return settings() !== null;
}

const escape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export type EmailContent = { subject: string; html: string; text: string };

/**
 * Il testo dell'email viene dal catalogo e dai dati dell'ordine, quindi è
 * costruito qui e non in un template remoto: quello che leggi nel codice è
 * quello che riceve il cliente, e i nomi dei prodotti sono escapati.
 */
export function orderEmailContent(order: StoredOrder): EmailContent {
  const method = getShippingMethod(order.shipping);
  const fullName = [order.customer.firstName, order.customer.lastName].filter(Boolean).join(" ").trim();
  const greeting = fullName ? `Grazie ${fullName}` : "Grazie";
  const subject = `Ordine ${order.id} confermato — Bleachwears`;

  const lineText = order.lines.map(
    (line) =>
      `${line.quantity} × ${line.name}${line.size ? ` (${line.size})` : ""} — ${money(line.total)}` +
      (line.detail ? `\n   ${line.detail}` : ""),
  );

  const address = [order.address.street, [order.address.zip, order.address.city].filter(Boolean).join(" "), order.address.province, order.address.country]
    .filter(Boolean)
    .join(", ");

  const text = [
    `${greeting},`,
    "",
    `abbiamo ricevuto il pagamento dell'ordine ${order.id}.`,
    "Ogni capo viene dipinto a mano: dalla conferma servono 7–14 giorni di lavorazione, poi parte la spedizione.",
    "",
    ...lineText,
    "",
    `Subtotale: ${money(order.subtotal)}`,
    `Spedizione (${method.label}): ${order.shippingCost > 0 ? money(order.shippingCost) : "gratuita"}`,
    `Totale: ${money(order.total)}`,
    "",
    `Consegna stimata: ${method.eta}.`,
    address ? `Indirizzo: ${address}.` : "",
    "",
    "Rispondi a questa email per qualsiasi cosa.",
    "— Bleachwears",
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  const rows = order.lines
    .map(
      (line) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #e7e1d4;">
            <strong>${escape(line.name)}</strong>${line.size ? ` · ${escape(line.size)}` : ""}
            <div style="color:#6b6459;font-size:13px;">${escape(line.detail)}</div>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #e7e1d4;text-align:right;white-space:nowrap;">
            ${line.quantity} × ${escape(money(line.total))}
          </td>
        </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="it">
  <body style="margin:0;background:#f4f0e6;font-family:Helvetica,Arial,sans-serif;color:#171a1c;">
    <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
      <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6459;">Bleachwears</p>
      <h1 style="margin:0 0 16px;font-size:26px;line-height:1.2;">Ordine confermato</h1>
      <p style="margin:0 0 8px;font-size:15px;">${escape(greeting)},</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">
        abbiamo ricevuto il pagamento dell&apos;ordine <strong>${escape(order.id)}</strong>.
        Ogni capo viene dipinto a mano: dalla conferma servono 7–14 giorni di lavorazione, poi parte la spedizione.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}
        <tr>
          <td style="padding:10px 0;color:#6b6459;">Subtotale</td>
          <td style="padding:10px 0;text-align:right;">${escape(money(order.subtotal))}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#6b6459;">Spedizione · ${escape(method.label)}</td>
          <td style="padding:10px 0;text-align:right;">${order.shippingCost > 0 ? escape(money(order.shippingCost)) : "gratuita"}</td>
        </tr>
        <tr>
          <td style="padding:12px 0;border-top:1px solid #171a1c;font-weight:bold;">Totale</td>
          <td style="padding:12px 0;border-top:1px solid #171a1c;text-align:right;font-weight:bold;">${escape(money(order.total))}</td>
        </tr>
      </table>
      <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#6b6459;">
        Consegna stimata: ${escape(method.eta)}.${address ? `<br />Indirizzo: ${escape(address)}.` : ""}
      </p>
      <p style="margin:24px 0 0;font-size:13px;color:#6b6459;">Rispondi a questa email per qualsiasi cosa.</p>
    </div>
  </body>
</html>`;

  return { subject, html, text };
}

export type SendResult = {
  sent: boolean;
  reason?: "not-configured" | "no-recipient" | "duplicate" | "provider-error";
  status?: number;
};

/**
 * WEBHOOK: Stripe può consegnare lo stesso evento più volte. Il promemoria è per
 * istanza, quindi su un deploy con più istanze può capitare una seconda email:
 * il webhook resta il punto in cui una consegna duplicata è possibile.
 */
const alreadySent = new Set<string>();

export async function sendOrderConfirmation(
  order: StoredOrder,
  fallbackEmail?: string | null,
): Promise<SendResult> {
  const to = (order.customer.email?.trim() || fallbackEmail?.trim()) ?? "";
  if (!to) {
    console.warn(JSON.stringify({ event: "order.email", ok: false, reason: "no-recipient", order: order.id }));
    return { sent: false, reason: "no-recipient" };
  }

  if (alreadySent.has(order.id)) return { sent: true, reason: "duplicate" };

  const config = settings();
  if (!config) {
    console.warn(JSON.stringify({ event: "order.email", ok: false, reason: "not-configured", order: order.id }));
    return { sent: false, reason: "not-configured" };
  }

  const content = orderEmailContent(order);

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [to],
        subject: content.subject,
        html: content.html,
        text: content.text,
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    console.info(JSON.stringify({ event: "order.email", ok: response.ok, status: response.status, order: order.id }));

    if (!response.ok) return { sent: false, reason: "provider-error", status: response.status };

    alreadySent.add(order.id);
    return { sent: true };
  } catch (error) {
    console.error(JSON.stringify({ event: "order.email", ok: false, reason: "network", error: String(error), order: order.id }));
    return { sent: false, reason: "provider-error" };
  }
}
