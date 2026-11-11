# Verifica delle promesse commerciali

**Stato**: audit statico dei testi eseguito. **Verifica in admin non eseguita**: nessun accesso al negozio, quindi non so se le impostazioni reali corrispondono alle frasi che i testi promettono.

Le promesse si dividono in due gruppi:

1. **Promesse con un valore** (spedizione gratuita sopra 80 €, resi entro 30 giorni) → devono combaciare con un'impostazione precisa di Shopify.
2. **Promesse senza valore** ("disponibilità limitata", "senza riassortimento", "quantità limitata") → dipendono da scorte e politiche di acquisto, non da un campo.

---

## 0. Esito dell'audit (11/11/2026)

Non ho potuto leggere le impostazioni di Shopify, ma ho letto **il tema e il codice presenti nel progetto**. Tre conflitti non sono ipotetici: sono già nel repository.

| # | Conflitto | Fonti | Stato |
|---|---|---|---|
| 1 | **Soglia spedizione**: 80 € nei testi, **120 € nel tema** | testi vs `shopify-theme/templates/index.json` (righe 19, 37), `sections/ticker.liquid` (36, 46), `sections/featured-collection.liquid` (30) | **bloccante**: o la tariffa in admin è 80 e il tema è rimasto al default, o è 120 e i testi sono sbagliati |
| 2 | **Resi**: era 30 nei testi, **14 nella pagina legale e nel codice** | `app/legale/spedizioni-e-resi/page.tsx` ("Resi entro 14 giorni", aggiornata 9/11/2026) + `SELLER.withdrawalDays: 14` | **RISOLTO**: la verità è 14. I testi sono stati corretti. Il tema dice ancora "reso gratuito 30 giorni" ed è falso due volte (giorni e gratuità) |
| 3 | **Tempi di lavorazione** non citati da nessun testo | `lib/shop/business.ts` → `PROCESSING_NOTE`: "Ogni capo viene dipinto a mano dopo l'ordine: 7–14 giorni di lavorazione prima della spedizione." | **da aggiungere**: la produzione è su ordinazione, il cliente deve saperlo prima di comprare |
| 4 | **Dati venditore vuoti** | `lib/shop/business.ts`: `legalName`, `vat`, `address`, `email` tutte stringhe vuote | **bloccante per legge**: senza ragione sociale, P. IVA e sede non puoi aprire gli ordini né mettere un footer email conforme |

### Cosa significa in pratica

- Finché il conflitto 1 non è risolto, **nessuno dei testi con "80 €" è pubblicabile**: se la soglia vera è 120 €, quattordici occorrenze sono da correggere in un colpo (lo script le elenca).
- Il conflitto 2 è **risolto**: la fonte di verità è la pagina legale (`app/legale/spedizioni-e-resi/page.tsx`, aggiornata 9/11/2026), che dice "Resi entro 14 giorni", con rimborso entro 14 giorni dal rientro e spese di restituzione a carico del cliente. I testi dei documenti sono stati allineati a 14.
- **Tema corretto in locale (11/11/2026)**: `shopify-theme/sections/main-product.liquid` riga 127 e `templates/product.json` riga 6 ora dicono "Lavorazione 7–14 giorni · Spedizione 1–5 giorni Italia · Resi entro 14 giorni (spese a tuo carico)". Da deployare prima di pubblicare.
- Il conflitto 3 cambia il tono di due email: con 7–14 giorni di lavorazione, la conferma d'ordine deve dire quando parte il capo, non solo "spedito".
- Il conflitto 4 è l'unico che blocca tutto il resto: senza i dati del venditore non si apre il negozio.

---

## 1. Registro delle promesse

| Promessa | Dove appare | Cosa la governa in Shopify | Cosa controllare |
|---|---|---|---|
| **Spedizione gratuita sopra 80 €** | `collezioni-testi.md` (meta di Drop, Felpe, Tutto), `email-testi.md` (benvenuto), `email-lancio-fw26.md` (lancio), `RUNBOOK.md` §0 | Impostazioni → **Spedizione e consegna** → profilo di spedizione → tariffe → "Spedizione gratuita condizionale" (soglia per zona) | che esista una tariffa gratuita con soglia **80 €** per **ogni** zona servita, non solo per l'Italia |
| **Resi entro 14 giorni** | stessi file, più le schede | pagina legale `app/legale/spedizioni-e-resi/page.tsx` e `SELLER.withdrawalDays` in `lib/shop/business.ts` | che entrambi dicano 14 giorni dalla consegna, spese di restituzione a carico del cliente salvo difetto |
| **Disponibilità limitata** (Drop FW26) | `collezioni-testi.md` | Scorte reali dei due capi | se riassortisci, togli la frase: è una promessa di scarsità |
| **Senza riassortimento** (Ultimi pezzi) | `collezioni-testi.md` | Politica di acquisto | se conti di rifornire, togli la frase |
| **Quantità limitata** (carrello, email 2) | `email-testi.md` | Scorte reali | con un catalogo che cresce, la frase diventa falsa |
| **"Quando una taglia finisce la disattiviamo"** | `email-lancio-fw26.md` (email 5) | Variante → **Continua a vendere quando esaurito** deve essere **OFF**; il tema deve mostrare la taglia esaurita disabilitata | che una variante a 0 risulti disabilitata e non nascosta |
| **"Rispondi a questa email: legge una persona"** | `email-testi.md`, `email-lancio-fw26.md` (email 4) | casella di risposta monitorata | che l'indirizzo di risposta esista e qualcuno lo legga davvero |
| **Prezzi 390 € / 130 €** | email, collezioni, schede | Prodotto → prezzo, e impostazioni tasse del mercato | che il prezzo mostrato includa l'IVA per il mercato italiano e non cambi con lo sconto attivo |

---

## 2. Cosa non è stato verificato

- Se la tariffa "spedizione gratuita sopra 80 €" esiste davvero, e per quali zone.
- Se la politica di reso pubblicata dice 30 giorni.
- Se le varianti sono impostate per non vendere a giacenza zero.
- Se i prezzi includono l'IVA nel mercato di riferimento.
- Qualsiasi cosa sullo storefront live: non conosco l'URL del negozio.

Ho invece letto il tema (`shopify-theme/`) e il codice (`lib/shop/`): i conflitti trovati così sono in §0, e sono più concreti di quelli che avrei trovato in admin.

Sono tutte verifiche che richiedono l'admin. Sotto c'è la procedura per farle in 15 minuti.

---

## 3. Procedura di verifica in admin

### Spedizione (5 min)

1. Impostazioni → **Spedizione e consegna** → apri il profilo di spedizione usato dai prodotti.
2. Per **ogni zona** (Italia, UE, extra UE): verifica che esista una tariffa con condizione *"ordine superiore a 80 €"* e costo **0**.
3. Se una zona non ce l'ha, o la soglia è diversa, hai due strade: aggiungi la tariffa, oppure cambi i testi (vedi §4).
4. Prova reale: carrello da 79 € → la spedizione deve essere a pagamento; carrello da 81 € → gratuita. Se il confine non è netto, il problema è la soglia o una tariffa concorrente.

### Resi (3 min)

1. Impostazioni → **Politiche** → **Politica di reso**: cerca "30" e verifica che il testo non dica altro (14 giorni, "entro 30 giorni dall'acquisto" invece che dalla consegna).
2. Apri `/policies/refund-policy` sul sito: è la pagina che il cliente legge davvero.
3. Se usi un'app di resi, controlla la finestra configurata lì: è quella che il cliente vede nel portale.

### Giacenze e taglie (4 min)

1. Prodotto → variante → **Continua a vendere quando esaurito**: deve essere **OFF** su cappotto e dolcevita.
2. Porta una variante di prova a 0 e apri la scheda: la taglia deve essere **visibile ma disabilitata**. Se sparisce, il testo dell'email 5 promette una cosa che il sito non fa.
3. Rimetti la giacenza a posto e cancella il prodotto di prova.

### Email (3 min)

1. Rispondi a un'email di test dall'indirizzo di risposta: deve arrivare a una casella che leggi.
2. Footer: disiscrizione e indirizzo fisico presenti.
3. Anteprima con nome cliente assente: deve dire "Ciao,".

---

## 4. Se una promessa non regge

Regola: **si allinea il testo alla realtà**, tranne quando la promessa è un vantaggio competitivo che vale la pena attivare davvero.

| Se scopri che… | Cosa fare |
|---|---|
| la spedizione gratuita parte da 100 € | o porti la soglia a 80 €, o cambi i testi (4 file, vedi scansione sotto) |
| la spedizione gratuita vale solo in Italia | aggiungi "in Italia" ai testi, oppure estendi la tariffa alle altre zone |
| i resi sono 14 giorni | o allunghi la policy a 30, o cambi i testi. 30 giorni è anche il minimo legale UE per il diritto di recesso: sotto i 14 non si può scendere |
| le varianti vendono a giacenza zero | disattiva l'opzione, altrimenti "quando finisce la disattiviamo" è falso |
| il prezzo è IVA esclusa per qualche mercato | non toccare i testi: sistema le impostazioni tasse, altrimenti il cliente vede un prezzo e ne paga un altro |

---

## 5. Scansione automatica dei testi

```bash
node scripts/promesse.mjs
```

Elenca ogni occorrenza di "spedizione gratuita" e "resi … giorni" nei file di `docs/shopify`, con file e riga, e **esce con codice 1** se trova un valore diverso da 80 € / 30 giorni o una promessa senza soglia.

I valori canonici sono in cima allo script:

```js
const CANONICO = { spedizioneGratuitaSopra: 80, giorniReso: 30 };
```

Se cambi la politica del negozio, cambia qui e rilancia lo script: ti dice esattamente quali righe dei testi sono rimaste indietro.

---

## 6. Checklist

- [ ] Tariffa "spedizione gratuita sopra 80 €" presente per ogni zona servita
- [ ] Prova carrello 79 € / 81 € superata
- [ ] Politica di reso a 30 giorni, pagina `/policies/refund-policy` allineata
- [ ] App resi (se presente) configurata a 30 giorni
- [ ] "Continua a vendere quando esaurito" OFF sulle varianti in vendita
- [ ] Taglia a 0 visibile e disabilitata, non nascosta
- [ ] Indirizzo di risposta email monitorato
- [ ] Footer email con disiscrizione e indirizzo fisico
- [ ] `node scripts/promesse.mjs` senza errori
- [ ] Promesse di scarsità ("limitata", "senza riassortimento") ancora vere
