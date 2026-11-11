# docs/shopify — indice e ordine di esecuzione

Cosa c'è in questa cartella, in che ordine si esegue, cosa blocca cosa.
Nessuna procedura è stata applicata allo store: richiedono tutte accesso all'admin di Shopify.

---

## Prima di tutto: i due bloccanti

I testi pronti contengono promesse commerciali che **non combaciano con il codice e il tema del progetto**. Finché non sono risolte, i testi non vanno pubblicati.

| Bloccante | Dettaglio | Dove |
|---|---|---|
| **Soglia spedizione** | 120 € — `FREE_SHIPPING_FROM` in `lib/shop/catalog.ts`, coerente con il tema | risolto 11/11/2026 |
| **Resi** | 14 giorni — `SELLER.withdrawalDays` e pagina legale `app/legale/spedizioni-e-resi` | risolto 11/11/2026 |

Da lì dipendono anche i tempi di lavorazione (7–14 giorni, mai citati) e i dati del venditore (vuoti in `lib/shop/business.ts`, bloccanti per legge).

---

## Ordine di esecuzione

| Fase | Cosa | Documento | Dipende da | Tempo |
|---|---|---|---|---|
| **1** | Risolvi soglia spedizione, giorni reso, tempi di lavorazione, dati venditore | `verifica-promesse.md` §0 e §3 | — | 30 min |
| **2** | Dismetti il pantalone e crei il redirect | `RUNBOOK.md` §1–§3 + `prodotti-da-dismettere.csv` + `scripts/redirects.mjs` | fase 1 | 45 min |
| **3** | Sistemi le collezioni: struttura, tag, testi, copertine | `collezioni-testi.md`, `collezioni-immagini.md` | fase 2 | 1 h |
| **4** | Pubblichi le schede prodotto: metafield taglie, swatch, blocchi | `RUNBOOK.md` §5bis | fase 3 | 1 h |
| **5** | Attivi le automazioni: redirect da Flow e avvisi | `RUNBOOK.md` §4, §4bis | fase 2 | 45 min |
| **6** | Programmi le email: benvenuto, carrello, lancio | `email-testi.md`, `email-lancio-fw26.md`, `RUNBOOK.md` §5ter | fasi 1 e 3 | 1 h |

L'ordine non è arbitrario: i testi delle collezioni e delle email citano la soglia di spedizione (fase 1); le email di lancio linkano prodotti che devono esistere e avere la tabella taglie (fase 4); il redirect del pantalone va creato prima di toccare le collezioni, altrimenti il link resta rotto per giorni.

### Se hai solo 30 minuti

Fai la **fase 1** (è un blocco legale: senza dati venditore e senza soglia corretta non si apre il negozio) e la **fase 2** (è l'unica cosa che, se sbagliata, rompe link già in circolazione). Tutto il resto può aspettare una settimana.

---

## File per file

| File | Cosa contiene | Quando serve |
|---|---|---|
| `RUNBOOK.md` | il documento operativo completo: stati prodotto, dismissione, redirect, Flow, collezioni, schede, email, registro, decisioni | sempre, è la fonte di verità |
| `verifica-promesse.md` | audit delle promesse commerciali, conflitti trovati, procedura di verifica in admin | fase 1, e ogni volta che cambi una politica |
| `prodotti-da-dismettere.csv` | mappa dei prodotti con azione (`tieni`/`dismetti`) e destinazione | fase 2 |
| `redirects-shopify.csv` | output pronto per l'import in Shopify (una riga: pantalone → collezione) | fase 2 |
| `collezioni-testi.md` | descrizioni, SEO title e meta delle 9 collezioni | fase 3 |
| `collezioni-immagini.md` | brief immagine, alt text e didascalie delle copertine | fase 3 |
| `email-testi.md` | benvenuto (2 email) e recupero carrello (3 email) | fase 6 |
| `email-lancio-fw26.md` | sequenza di lancio della campagna, con calendario e segmenti | fase 6 |
| `social-lancio-fw26.md` | post del feed e storie per gli stessi sei giorni del lancio, con orari, alt text e link | fase 6, insieme alle email di lancio |
| `post-acquisto-testi.md` | pagina di ringraziamento e email di conferma spedizione | fase 6, dopo le email |
| `README.md` | questo indice | — |

Script fuori da questa cartella:

| Script | Cosa fa |
|---|---|
| `scripts/redirects.mjs` | `init <export.csv>` crea la mappa dal tuo export · `genera` produce e valida `redirects-shopify.csv` |
| `scripts/promesse.mjs` | elenca ogni occorrenza di "spedizione gratuita" e "resi N giorni" e segnala i valori non canonici |

---

## Comandi

```bash
# redirect: dalla mappa al CSV importabile
node scripts/redirects.mjs genera

# promesse: coerenza dei testi tra loro (exit 1 se un valore non è canonico)
node scripts/promesse.mjs
```

I valori canonici stanno in cima ai rispettivi script (`CANONICO` in `promesse.mjs`). Si cambiano lì, non nei testi: poi lo script ti elenca le righe rimaste indietro.

---

## Regole che valgono in ogni fase

1. **Prima la bozza, poi il redirect.** Shopify accetta redirect solo da URL che danno 404.
2. **Non cambiare l'handle di un prodotto che resta in vendita**: rompe i link già in circolazione.
3. **Una promessa senza riscontro è un reclamo**: soglia, giorni di reso e tempi di lavorazione devono esistere nelle impostazioni prima di finire in un testo.
4. **Niente urgenza finta**: nessun countdown, nessun "ultimi pezzi" se il magazzino è pieno.
5. **I testi si pubblicano dopo la fase 1**, mai prima: sono la parte che il cliente cita quando chiede un rimborso.

---

## Cosa resta aperto

- Soglia spedizione reale (80 o 120 €) e allineamento del tema.
- Giorni di reso: politica a 30 o testi a 14.
- Tempi di lavorazione da inserire nelle email.
- Dati venditore in `lib/shop/business.ts` (ragione sociale, P. IVA, sede, email).
- Canale degli avvisi Flow: Slack o email interna.
- Terza email del carrello con sconto: attivare o no.
- Riferimento visivo del video: screenshot mai arrivati.
