import type { Metadata } from "next";
import { SELLER } from "@/lib/shop/business";
import { LegalShell } from "../LegalShell";

export const metadata: Metadata = {
  title: "Privacy — Bleachwears",
  description:
    "Quali dati raccogliamo quando ordini o ci scrivi, perché, per quanto tempo e come esercitare i tuoi diritti.",
};

const contact = SELLER.email ? (
  <a href={`mailto:${SELLER.email}`}>{SELLER.email}</a>
) : (
  <a href={SELLER.instagram} target="_blank" rel="noopener noreferrer">{SELLER.instagramHandle}</a>
);

export default function PrivacyPage() {
  return (
    <LegalShell kicker="Informazioni legali" title="Informativa privacy" updated="9 novembre 2026">
      <section>
        <h2>1. Titolare del trattamento</h2>
        <p>
          <strong>{SELLER.brand}</strong>
          {SELLER.legalName ? ` (${SELLER.legalName})` : ""}
          {SELLER.vat ? `, P. IVA ${SELLER.vat}` : ""}
          {SELLER.address ? `, ${SELLER.address}` : `, ${SELLER.country}`}. Contatti: {contact}.
        </p>
      </section>

      <section>
        <h2>2. Dati che trattiamo</h2>
        <ul>
          <li><strong>Ordine:</strong> nome, cognome, email, telefono se lo inserisci, indirizzo di spedizione, note per il corriere.</li>
          <li><strong>Contenuto dell’ordine:</strong> capi scelti, taglie, eventuali file o grafiche caricati nel Custom Lab.</li>
          <li><strong>Pagamento:</strong> gestito da Stripe. Noi riceviamo solo esito, importo e riferimento della transazione, mai il numero della carta.</li>
          <li><strong>Dati tecnici:</strong> indirizzo IP e log del server, conservati dal fornitore di hosting per sicurezza e diagnostica.</li>
          <li><strong>Messaggi:</strong> quello che ci scrivi su email o Instagram.</li>
        </ul>
      </section>

      <section>
        <h2>3. Perché e su quale base giuridica</h2>
        <ul>
          <li><strong>Eseguire l’ordine</strong> e consegnarlo — art. 6.1.b GDPR (contratto).</li>
          <li><strong>Obblighi fiscali e contabili</strong> sulla vendita — art. 6.1.c GDPR (obbligo legale).</li>
          <li><strong>Sicurezza del sito</strong> e prevenzione degli abusi — art. 6.1.f GDPR (interesse legittimo).</li>
          <li><strong>Rispondere ai messaggi</strong> — art. 6.1.b o 6.1.f, secondo il caso.</li>
        </ul>
        <p>Non facciamo profilazione pubblicitaria e non vendiamo dati a nessuno.</p>
      </section>

      <section>
        <h2>4. A chi possono arrivare</h2>
        <p>
          Ai fornitori che ci servono per far funzionare il negozio, ciascuno per la sua parte: hosting (Vercel),
          database (Supabase), pagamenti (Stripe) e corriere per la consegna. Lavorano su nostra istruzione o come
          titolari autonomi, secondo i rispettivi contratti.
        </p>
      </section>

      <section>
        <h2>5. Per quanto tempo</h2>
        <ul>
          <li>Dati dell’ordine e documenti fiscali: 10 anni, come richiede la legge.</li>
          <li>Email di conferma e corrispondenza: 24 mesi.</li>
          <li>Log tecnici del server: il tempo minimo del fornitore di hosting, di norma poche settimane.</li>
          <li>File caricati nel Custom Lab: fino alla realizzazione del capo, poi cancellati su richiesta.</li>
        </ul>
      </section>

      <section>
        <h2>6. I tuoi diritti</h2>
        <p>
          Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità e opporti al trattamento
          scrivendo a {contact}. Rispondiamo entro un mese. Se la risposta non ti convince puoi rivolgerti al
          Garante per la protezione dei dati personali.
        </p>
      </section>

      <section>
        <h2>7. Cookie</h2>
        <p>
          Il sito non usa cookie di profilazione né strumenti pubblicitari. Il carrello vive nella memoria della
          pagina e non viene salvato sul tuo dispositivo. Eventuali cookie tecnici sono quelli strettamente necessari
          a servire il sito.
        </p>
      </section>

      <section>
        <h2>8. Modifiche</h2>
        <p>
          Se cambiamo qualcosa in questa informativa aggiorniamo la data in cima. Le modifiche valgono per gli ordini
          successivi.
        </p>
      </section>
    </LegalShell>
  );
}
