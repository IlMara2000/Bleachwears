import Link from "next/link";
import type { Metadata } from "next";
import { FREE_SHIPPING_FROM, money } from "@/lib/shop/catalog";
import { SELLER } from "@/lib/shop/business";
import { LegalShell } from "../LegalShell";

export const metadata: Metadata = {
  title: "Termini di vendita — Bleachwears",
  description:
    "Come funzionano ordini, prezzi, lavorazione a mano, recesso e garanzia sui capi Bleachwears.",
};

const sellerContact = SELLER.email ? (
  <a href={`mailto:${SELLER.email}`}>{SELLER.email}</a>
) : (
  <a href={SELLER.instagram} target="_blank" rel="noopener noreferrer">{SELLER.instagramHandle}</a>
);

export default function TerminiPage() {
  return (
    <LegalShell kicker="Informazioni legali" title="Termini di vendita" updated="9 novembre 2026">
      <section>
        <h2>1. Chi vende</h2>
        <p>
          I capi sono venduti da <strong>{SELLER.brand}</strong>{SELLER.legalName ? ` (${SELLER.legalName})` : ""}
          {SELLER.vat ? `, P. IVA ${SELLER.vat}` : ""}
          {SELLER.address ? `, con sede in ${SELLER.address}` : `, con sede in ${SELLER.country}`}.
          Per qualsiasi cosa scrivi a {sellerContact}: rispondiamo entro due giorni lavorativi.
        </p>
      </section>

      <section>
        <h2>2. Cosa stai comprando</h2>
        <p>
          Ogni capo è dipinto a mano, uno alla volta, con acrilico o candeggina su cotone. Non esistono due pezzi
          identici: piccole differenze di pennellata, intensità del colore e posizione del segno fanno parte del
          prodotto e non sono difetti. Le foto mostrano il capo reale quando è disponibile; per i pezzi su misura
          mostrano il lavoro da cui partiremo.
        </p>
      </section>

      <section>
        <h2>3. Ordine e conferma</h2>
        <p>
          L’ordine inviato dal checkout è una proposta d’acquisto. Diventa contratto quando ricevi la nostra
          conferma via email, che contiene riferimento dell’ordine, riepilogo, totale e tempi di lavorazione.
          Se un capo non fosse più disponibile ti scriviamo subito proponendoti un’alternativa o il rimborso
          completo.
        </p>
      </section>

      <section>
        <h2>4. Prezzi e pagamento</h2>
        <p>
          I prezzi sono in euro e comprensivi di IVA, salvo diversa indicazione. Il costo di spedizione è mostrato
          nel checkout prima della conferma e non cambia dopo. La spedizione è inclusa da {money(FREE_SHIPPING_FROM)}.
        </p>
        <p>
          Il pagamento avviene con carta tramite Stripe: i dati della carta non passano e non vengono conservati sui
          nostri sistemi. Finché il collegamento al provider non è attivo, l’ordine viene registrato senza alcun
          addebito e ti ricontattiamo per completare il pagamento.
        </p>
      </section>

      <section>
        <h2>5. Lavorazione e consegna</h2>
        <p>
          Ogni capo viene dipinto dopo l’ordine: servono da 7 a 14 giorni di lavoro, a seconda del pezzo, prima
          della spedizione. I tempi di consegna sono indicati in <Link href="/legale/spedizioni-e-resi">spedizioni e resi</Link>.
          Se un ritardo supera i 30 giorni puoi chiedere l’annullamento e il rimborso completo.
        </p>
      </section>

      <section>
        <h2>6. Diritto di recesso</h2>
        <p>
          Hai {SELLER.withdrawalDays} giorni dalla consegna per recedere, senza dover motivare la decisione. Scrivici
          a {sellerContact} indicando il riferimento dell’ordine: ti diamo le istruzioni per la restituzione.
          Il rimborso arriva entro 14 giorni dal recesso, con lo stesso metodo di pagamento usato per l’acquisto.
        </p>
        <p>
          <strong>Eccezione:</strong> i capi personalizzati o realizzati su tua richiesta (per esempio un Custom
          Reaction con la tua grafica, una taglia o un colore scelti da te) sono esclusi dal recesso ai sensi
          dell’art. 59, comma 1, lett. c) del Codice del Consumo. Restano coperti dalla garanzia per i difetti.
        </p>
        <p>
          Le spese di restituzione sono a tuo carico, salvo che il capo sia difettoso o non corrisponda a quanto
          ordinato. Il capo deve tornare integro, non indossato e con le etichette.
        </p>
      </section>

      <section>
        <h2>7. Garanzia legale</h2>
        <p>
          Tutti i capi sono coperti dalla garanzia legale di conformità di 24 mesi. Se il capo presenta un difetto
          (cuciture, tessuto, colore che si stacca), scrivici con una foto entro 48 ore dalla consegna: ripariamo,
          sostituiamo o rimborsiamo.
        </p>
      </section>

      <section>
        <h2>8. Reclami, legge applicabile e foro</h2>
        <p>
          Per qualsiasi reclamo scrivi a {sellerContact}: rispondiamo entro 30 giorni. Il contratto è regolato dalla
          legge italiana. Se sei un consumatore, per le controversie è competente il tribunale del luogo in cui risiedi
          o hai il domicilio, e puoi rivolgerti alla piattaforma europea di risoluzione delle controversie online.
        </p>
      </section>

      <section>
        <h2>9. Contatti</h2>
        <p>
          {SELLER.brand} · {SELLER.country} · {sellerContact} ·{" "}
          <a href={SELLER.instagram} target="_blank" rel="noopener noreferrer">{SELLER.instagramHandle}</a>
        </p>
      </section>
    </LegalShell>
  );
}
