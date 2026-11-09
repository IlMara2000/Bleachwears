import type { Metadata } from "next";
import { FREE_SHIPPING_FROM, SHIPPING_METHODS, money } from "@/lib/shop/catalog";
import { SELLER } from "@/lib/shop/business";
import { LegalShell } from "../LegalShell";

export const metadata: Metadata = {
  title: "Spedizioni e resi — Bleachwears",
  description:
    "Tempi di lavorazione, tariffe di spedizione in Italia, tracciamento, ritiro a mano e come funziona il reso.",
};

export default function SpedizioniPage() {
  return (
    <LegalShell kicker="Informazioni legali" title="Spedizioni e resi" updated="9 novembre 2026">
      <section>
        <h2>Produzione prima, spedizione dopo</h2>
        <p>
          Non abbiamo magazzino: ogni capo viene dipinto a mano dopo l’ordine. Servono da 7 a 14 giorni di
          lavorazione, a seconda della tecnica e del pezzo. Da lì parte la spedizione.
        </p>
      </section>

      <section>
        <h2>Tariffe e tempi in Italia</h2>
        <div className="legal-table">
          <div className="legal-table-row is-head">
            <span>Metodo</span>
            <span>Consegna</span>
            <span>Costo</span>
          </div>
          {SHIPPING_METHODS.map((method) => (
            <div className="legal-table-row" key={method.id}>
              <span>{method.label}</span>
              <span>{method.eta}</span>
              <span>{method.price === 0 ? "Gratis" : money(method.price)}</span>
            </div>
          ))}
        </div>
        <p>
          La spedizione è inclusa per ordini da {money(FREE_SHIPPING_FROM)} in su. Ogni pacco parte con codice di
          tracciamento, che ricevi via email insieme alla conferma di spedizione.
        </p>
      </section>

      <section>
        <h2>Ritiro a mano</h2>
        <p>
          Puoi scegliere il ritiro a mano nel checkout: quando il capo è pronto ti scriviamo per concordare luogo e
          orario. Nessun costo aggiuntivo.
        </p>
      </section>

      <section>
        <h2>Resi entro 14 giorni</h2>
        <p>
          Hai {SELLER.withdrawalDays} giorni dalla consegna per cambiare idea sui capi non personalizzati. Il capo deve
          essere integro, non indossato, con le etichette attaccate. Scrivici indicando il riferimento dell’ordine
          e ti mandiamo le istruzioni.
        </p>
        <ul>
          <li>Spese di restituzione a tuo carico, salvo capo difettoso o errato.</li>
          <li>Rimborso entro 14 giorni dal rientro del capo, con lo stesso metodo di pagamento.</li>
          <li>
            I capi realizzati su tua richiesta (grafica personale, colore o taglia scelti nel Custom Lab) non sono
            resi ai sensi dell’art. 59, comma 1, lett. c) del Codice del Consumo, ma restano coperti dalla garanzia.
          </li>
        </ul>
      </section>

      <section>
        <h2>Capo arrivato con un problema</h2>
        <p>
          Se il pacco è danneggiato, il capo ha un difetto o non è quello che hai ordinato, scrivici entro 48 ore con
          una foto: sistemiamo, sostituiamo o rimborsiamo, comprese le spese di spedizione. La garanzia legale dura
          24 mesi.
        </p>
      </section>

      <section>
        <h2>Fuori dall’Italia</h2>
        <p>
          Il checkout gestisce per ora solo l’Italia. Se sei all’estero scrivici su{" "}
          <a href={SELLER.instagram} target="_blank" rel="noopener noreferrer">{SELLER.instagramHandle}</a>: valutiamo
          caso per caso costi e dogana.
        </p>
      </section>
    </LegalShell>
  );
}
