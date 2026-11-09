"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { SHIPPING_METHODS, computeTotals, money, shippingCost } from "@/lib/shop/catalog";
import { SELLER } from "@/lib/shop/business";

export type CheckoutItem = {
  id: string;
  sku: string;
  name: string;
  detail: string;
  price: number;
  size?: string;
  options?: { custom?: boolean; back?: boolean; drops?: number };
  quantity?: number;
};

type Form = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  street: string;
  zip: string;
  city: string;
  province: string;
  notes: string;
};

const EMPTY: Form = {
  email: "",
  firstName: "",
  lastName: "",
  phone: "",
  street: "",
  zip: "",
  city: "",
  province: "",
  notes: "",
};

type Result = {
  mode: "manual" | "stripe";
  orderId: string;
  total: number;
  message?: string;
};

/* Esito letto da Stripe al ritorno: la query string da sola non basta. */
type PaymentCheck =
  | { state: "checking" }
  | { state: "paid"; total?: number }
  | { state: "unpaid" }
  | { state: "unknown" }
  | { state: "error"; message?: string };

const STEPS = ["Contatti", "Consegna", "Pagamento"] as const;

export function CheckoutView({
  items,
  shipping,
  returnInfo,
  onShippingChange,
  onRemove,
  onBackToShop,
  onCompleted,
  onNotify,
}: {
  items: CheckoutItem[];
  shipping: string;
  returnInfo: { orderId: string; cancelled: boolean; sessionId: string | null } | null;
  onShippingChange: (id: string) => void;
  onRemove: (id: string) => void;
  onBackToShop: () => void;
  onCompleted: () => void;
  onNotify: (message: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [accepted, setAccepted] = useState(false);
  const paidReturn = returnInfo;
  const [paymentCheck, setPaymentCheck] = useState<PaymentCheck | null>(() => {
    if (!paidReturn || paidReturn.cancelled) return null;
    return paidReturn.sessionId ? { state: "checking" } : { state: "unknown" };
  });

  useEffect(() => {
    if (!paidReturn || paidReturn.cancelled || !paidReturn.sessionId) return;
    let alive = true;
    const timer = setTimeout(() => {
      if (alive) setPaymentCheck((current) => (current?.state === "checking" ? { state: "error" } : current));
    }, 15000);

    (async () => {
      try {
        const response = await fetch(
          `/api/checkout/confirm?session_id=${encodeURIComponent(paidReturn.sessionId ?? "")}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as { ok?: boolean; paid?: boolean; total?: number; error?: string };
        if (!alive) return;
        if (!response.ok || !payload.ok) {
          setPaymentCheck({ state: "error", message: payload.error });
          return;
        }
        setPaymentCheck(payload.paid ? { state: "paid", total: payload.total } : { state: "unpaid" });
      } catch {
        if (alive) setPaymentCheck({ state: "error" });
      } finally {
        clearTimeout(timer);
      }
    })();

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [paidReturn]);

  const pickup = shipping === "pickup";
  const subtotal = items.reduce((sum, item) => sum + item.price * (item.quantity ?? 1), 0);
  const shippingPrice = shippingCost(shipping, subtotal);
  const total = subtotal + shippingPrice;
  const method = SHIPPING_METHODS.find((entry) => entry.id === shipping) ?? SHIPPING_METHODS[0];

  const summary = useMemo(() => {
    const lines = items.map((item) => ({
      sku: item.sku,
      name: item.name,
      detail: item.detail,
      quantity: item.quantity ?? 1,
      unitPrice: item.price,
      total: item.price * (item.quantity ?? 1),
      size: item.size,
    }));
    return computeTotals(lines, shipping);
  }, [items, shipping]);

  function update(field: keyof Form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  }

  function validateStep(index: number) {
    if (index === 0) {
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(form.email.trim())) return "Inserisci un indirizzo email valido.";
      if (form.firstName.trim().length < 2) return "Serve il nome.";
      if (form.lastName.trim().length < 2) return "Serve il cognome.";
    }
    if (index === 1 && !pickup) {
      if (form.street.trim().length < 4) return "Serve l’indirizzo completo (via e numero).";
      if (!/^\d{5}$/.test(form.zip.trim())) return "Il CAP deve avere 5 cifre.";
      if (form.city.trim().length < 2) return "Serve la città.";
      if (form.province.trim().length !== 2) return "La provincia ha due lettere, per esempio MI.";
    }
    return "";
  }

  function next() {
    const problem = validateStep(step);
    if (problem) {
      setError(problem);
      return;
    }
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = validateStep(0) || validateStep(1);
    if (problem) {
      setError(problem);
      return;
    }
    if (!accepted) {
      setError("Conferma di aver letto termini e informativa privacy.");
      return;
    }
    if (!items.length) {
      setError("Il carrello è vuoto.");
      return;
    }

    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({
            sku: item.sku,
            size: item.size,
            quantity: item.quantity ?? 1,
            options: item.options,
          })),
          customer: {
            firstName: form.firstName,
            lastName: form.lastName,
            email: form.email,
            phone: form.phone,
          },
          address: {
            street: form.street,
            zip: form.zip,
            city: form.city,
            province: form.province,
            country: "Italia",
            notes: form.notes,
          },
          shipping,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        mode?: "manual" | "stripe";
        orderId?: string;
        checkoutUrl?: string;
        total?: number;
        message?: string;
      };

      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Qualcosa non ha funzionato: riprova.");
        return;
      }

      if (payload.mode === "stripe" && payload.checkoutUrl) {
        window.location.assign(payload.checkoutUrl);
        return;
      }

      setResult({
        mode: payload.mode ?? "manual",
        orderId: payload.orderId ?? "",
        total: payload.total ?? summary.total,
        message: payload.message,
      });
      onCompleted();
      onNotify("Ordine registrato");
    } catch {
      setError("Connessione assente: controlla la rete e riprova.");
    } finally {
      setSending(false);
    }
  }

  if (paidReturn) {
    const cancelled = paidReturn.cancelled;
    const paid = paymentCheck?.state === "paid";
    const checking = !cancelled && paymentCheck?.state === "checking";
    const total = paid ? paymentCheck.total : undefined;

    return (
      <section className="screen checkout-screen" aria-labelledby="checkout-done-title">
        <div className="checkout-done">
          <span className="section-kicker">
            {cancelled ? "Pagamento annullato" : paid ? "Pagamento ricevuto" : "Pagamento con carta"}
          </span>
          <h1 id="checkout-done-title">
            {cancelled
              ? "Nessun addebito."
              : checking
                ? "Verifico il pagamento…"
                : paid
                  ? "È tuo. Adesso lo dipingiamo."
                  : paymentCheck?.state === "error"
                    ? "Non riesco a leggere il pagamento."
                    : "Pagamento non completato."}
          </h1>
          <p className="checkout-ref">
            Riferimento <strong>{paidReturn.orderId}</strong>
            {typeof total === "number" ? ` · ${money(total)}` : ""}
          </p>
          <p aria-live="polite">
            {cancelled
              ? "Il carrello è ancora qui, con i capi che avevi scelto: puoi riprovare quando vuoi."
              : checking
                ? "Sto leggendo la conferma di Stripe. Qualche secondo e ti dico com’è andata."
                : paid
                  ? "Ti scriviamo sull’email dell’ordine appena il capo entra in lavorazione. Servono 7–14 giorni di lavoro prima della spedizione."
                  : paymentCheck?.state === "error"
                    ? paymentCheck.message ??
                      "Non riesco a leggere lo stato del pagamento da qui. Nessun addebito viene dato per buono senza conferma di Stripe: se hai ricevuto la ricevuta, l’ordine è nostro e ti scriviamo appena lo vediamo."
                    : "Stripe non ci risulta aver completato il pagamento, quindi non abbiamo addebitato nulla. Il carrello è ancora qui: puoi riprovare quando vuoi."}
          </p>
          <button type="button" className="solid-action" onClick={onBackToShop}>Torna al drop</button>
        </div>
      </section>
    );
  }

  if (result) {
    return (
      <section className="screen checkout-screen" aria-labelledby="checkout-done-title">
        <div className="checkout-done">
          <span className="section-kicker">Ordine registrato</span>
          <h1 id="checkout-done-title">Ci siamo quasi.</h1>
          <p className="checkout-ref">
            Riferimento <strong>{result.orderId}</strong> · {money(result.total)}
          </p>
          <p>
            {result.message ??
              "Abbiamo ricevuto la richiesta con i tuoi dati. Il pagamento con carta viene collegato in queste settimane: nessun importo è stato addebitato."}
          </p>
          <div className="checkout-done-notes">
            <div><strong>Cosa succede ora</strong><span>Controlliamo disponibilità e base, poi ti scriviamo all’email indicata.</span></div>
            <div><strong>Lavorazione</strong><span>7–14 giorni di lavoro a mano prima della spedizione.</span></div>
            <div><strong>Resi</strong><span>14 giorni sui capi non personalizzati, come da termini.</span></div>
          </div>
          <button type="button" className="solid-action" onClick={onBackToShop}>Torna al drop</button>
        </div>
      </section>
    );
  }

  if (!items.length) {
    return (
      <section className="screen checkout-screen" aria-labelledby="checkout-empty-title">
        <div className="checkout-done">
          <span className="section-kicker">Checkout</span>
          <h1 id="checkout-empty-title">Il carrello è vuoto.</h1>
          <p>Prima scegli un capo dal drop, oppure componine uno nel Custom Lab.</p>
          <button type="button" className="solid-action" onClick={onBackToShop}>Apri il drop</button>
        </div>
      </section>
    );
  }

  return (
    <section className="screen checkout-screen" aria-labelledby="checkout-title">
      <header className="checkout-head">
        <div>
          <span className="section-kicker">Checkout · Drop 01 / 2026</span>
          <h1 id="checkout-title">Chiudi il giro.</h1>
          <p>Tre passaggi, nessuna registrazione. I capi partono dopo la lavorazione a mano.</p>
        </div>
        <ol className="checkout-steps">
          {STEPS.map((label, index) => (
            <li key={label} className={index === step ? "is-current" : index < step ? "is-done" : ""}>
              <button type="button" onClick={() => (index < step ? setStep(index) : next())} disabled={index > step}>
                <span>{index < step ? "✓" : index + 1}</span>
                {label}
              </button>
            </li>
          ))}
        </ol>
      </header>

      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={submit} noValidate>
          {step === 0 && (
            <fieldset className="checkout-block">
              <legend><span>01</span> Chi sei</legend>
              <div className="field-grid">
                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(event) => update("email", event.target.value)}
                    placeholder="nome@email.it"
                    required
                  />
                  <small>Qui arriva la conferma e il codice di tracciamento.</small>
                </label>
                <label className="field">
                  <span>Telefono (facoltativo)</span>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(event) => update("phone", event.target.value)}
                    placeholder="+39 …"
                  />
                  <small>Solo se serve per la consegna.</small>
                </label>
                <label className="field">
                  <span>Nome</span>
                  <input value={form.firstName} onChange={(event) => update("firstName", event.target.value)} autoComplete="given-name" required />
                </label>
                <label className="field">
                  <span>Cognome</span>
                  <input value={form.lastName} onChange={(event) => update("lastName", event.target.value)} autoComplete="family-name" required />
                </label>
              </div>
            </fieldset>
          )}

          {step === 1 && (
            <>
              <fieldset className="checkout-block">
                <legend><span>02</span> Come arriva</legend>
                <div className="shipping-options">
                  {SHIPPING_METHODS.map((option) => {
                    const cost = shippingCost(option.id, subtotal);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={shipping === option.id ? "shipping-option is-selected" : "shipping-option"}
                        onClick={() => onShippingChange(option.id)}
                        aria-pressed={shipping === option.id}
                      >
                        <span className="shipping-radio" aria-hidden="true" />
                        <span className="shipping-copy">
                          <strong>{option.label}</strong>
                          <small>{option.eta} · {option.note}</small>
                        </span>
                        <b>{cost === 0 ? "Inclusa" : money(cost)}</b>
                      </button>
                    );
                  })}
                </div>
                {subtotal < 120 && (
                  <p className="checkout-hint">Spedizione inclusa da {money(120)}: mancano {money(120 - subtotal)}.</p>
                )}
              </fieldset>

              {!pickup && (
                <fieldset className="checkout-block">
                  <legend><span>02b</span> Dove</legend>
                  <div className="field-grid">
                    <label className="field is-wide">
                      <span>Indirizzo</span>
                      <input value={form.street} onChange={(event) => update("street", event.target.value)} autoComplete="street-address" placeholder="Via e numero civico" required />
                    </label>
                    <label className="field">
                      <span>CAP</span>
                      <input value={form.zip} onChange={(event) => update("zip", event.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" autoComplete="postal-code" required />
                    </label>
                    <label className="field">
                      <span>Città</span>
                      <input value={form.city} onChange={(event) => update("city", event.target.value)} autoComplete="address-level2" required />
                    </label>
                    <label className="field">
                      <span>Provincia</span>
                      <input value={form.province} onChange={(event) => update("province", event.target.value.toUpperCase().slice(0, 2))} autoComplete="address-level1" placeholder="MI" required />
                    </label>
                    <label className="field">
                      <span>Paese</span>
                      <input value="Italia" readOnly disabled />
                    </label>
                    <label className="field is-wide">
                      <span>Note per il corriere (facoltative)</span>
                      <input value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Citofono, piano, orari" />
                    </label>
                  </div>
                </fieldset>
              )}

              {pickup && (
                <fieldset className="checkout-block">
                  <legend><span>02b</span> Ritiro</legend>
                  <p className="checkout-text">
                    Ti scriviamo appena il capo è pronto per fissare luogo e orario. Serve solo un recapito: l’email va benissimo.
                  </p>
                </fieldset>
              )}
            </>
          )}

          {step === 2 && (
            <fieldset className="checkout-block">
              <legend><span>03</span> Pagamento</legend>
              <div className="payment-note">
                <strong>Pagamento con carta</strong>
                <p>
                  Il pagamento avviene sulla pagina sicura di Stripe, poi torni qui. La conferma la leggiamo
                  direttamente da Stripe: se il pagamento non risulta, non addebitiamo nulla. Se il collegamento
                  non è attivo, l’ordine viene solo registrato e ti ricontattiamo noi.
                </p>
              </div>

              <label className="confirmation-row">
                <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
                <span>
                  Ho letto i <a href="/legale/termini" target="_blank" rel="noopener noreferrer">termini di vendita</a>,
                  l’<a href="/legale/privacy" target="_blank" rel="noopener noreferrer">informativa privacy</a> e le
                  condizioni di <a href="/legale/spedizioni-e-resi" target="_blank" rel="noopener noreferrer">spedizione e reso</a>.
                </span>
              </label>

              <div className="checkout-recap" aria-live="polite">
                {items.map((item) => (
                  <div key={item.id}>
                    <span>{item.name}{item.size ? ` · ${item.size}` : ""}</span>
                    <b>{money(item.price * (item.quantity ?? 1))}</b>
                  </div>
                ))}
                <div><span>Spedizione · {method.label}</span><b>{shippingPrice === 0 ? "Inclusa" : money(shippingPrice)}</b></div>
                <div className="is-total"><span>Totale</span><b>{money(total)}</b></div>
              </div>

              <button type="submit" className="checkout-submit" disabled={sending}>
                <span>{sending ? "Invio in corso…" : "Conferma l’ordine"}</span>
                <span aria-hidden="true">{sending ? "…" : "→"}</span>
              </button>
              <p className="field-helper">
                Nessun addebito automatico: ricevi conferma con riferimento ordine e tempi di lavorazione.
              </p>
            </fieldset>
          )}

          {error && <p className="checkout-error" role="alert">{error}</p>}

          <div className="checkout-actions">
            <button type="button" className="ghost-action" onClick={() => (step === 0 ? onBackToShop() : setStep(step - 1))}>
              {step === 0 ? "Torna al drop" : "Indietro"}
            </button>
            {step < STEPS.length - 1 && (
              <button type="button" className="solid-action" onClick={next}>
                Continua <span aria-hidden="true">→</span>
              </button>
            )}
          </div>
        </form>

        <aside className="checkout-summary" aria-label="Riepilogo ordine">
          <div className="board-head">
            <span className="section-kicker">Il tuo ordine</span>
            <p>{String(items.length).padStart(2, "0")} {items.length === 1 ? "pezzo" : "pezzi"}</p>
          </div>
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.size ? `Taglia ${item.size} · ` : ""}{item.detail}</small>
                </div>
                <b>{money(item.price * (item.quantity ?? 1))}</b>
                <button type="button" onClick={() => onRemove(item.id)} aria-label={`Rimuovi ${item.name}`}>×</button>
              </li>
            ))}
          </ul>
          <div className="summary-totals">
            <div><span>Subtotale</span><b>{money(summary.subtotal)}</b></div>
            <div><span>Spedizione</span><b>{summary.shipping === 0 ? "Inclusa" : money(summary.shipping)}</b></div>
            <div className="is-total"><span>Totale</span><b>{money(summary.total)}</b></div>
          </div>
          <p className="summary-note">
            Lavorazione a mano: 7–14 giorni prima della spedizione. Pezzi unici, nessun reprint.
          </p>
          <p className="summary-note is-fine">
            Venditore: {SELLER.brand} · {SELLER.country}. Contatti e dati completi nelle pagine legali.
          </p>
        </aside>
      </div>
    </section>
  );
}
