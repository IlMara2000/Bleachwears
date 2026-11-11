# Runbook Shopify — Bleachwears

Versione 1.4 · 11 novembre 2026 · stato: procedura da eseguire in admin (nessuna modifica è stata applicata)

Novità 1.1: aggiunta la sezione §4bis sugli avvisi automatici (prodotto in bozza, esaurito, riassortimento).
Novità 1.2: aggiunta la sezione §5bis su schede prodotto, metafield taglie e checklist di pubblicazione PDP.
Novità 1.3: chiuse le decisioni su handle e capi in catalogo (§10); CSV ridotto a una riga.
Novità 1.4: aggiunta la sezione §5ter sulle email (benvenuto e recupero carrello) e allineati tutti i documenti di `docs/shopify`.

Questo è l'unico documento operativo. Indice della cartella e ordine di esecuzione: `README.md`. Sostituisce `collezioni-catalogo-ridotto.md` e `flow-redirect.md`.
Il file `redirects-shopify.csv` resta separato perché è un input macchina da importare, non documentazione.

---

## 0. Come usare questo runbook

- **Perimetro**: gestione di un catalogo che si riduce (prodotti dismessi, collezioni riorganizzate, redirect, automazione).
- **Cosa richiede accesso admin**: tutto. Chi esegue deve avere permessi su Prodotti, Contenuti, Sconti, App.
- **Regola d'ordine, la più importante di tutte**: prima il prodotto va in **Draft** (URL → 404), poi si crea il redirect. Shopify accetta redirect solo da URL rotti e cancella il redirect se l'URL torna valido.
- **Valori canonici** (devono coincidere con le impostazioni del negozio e con le pagine informative): spedizione gratuita sopra **120 €**, resi entro **14 giorni**. Se cambi uno dei due, aggiorna anche i testi di `collezioni-testi.md` e `email-testi.md`, che li citano.
- **Verifica delle promesse**: `node scripts/promesse.mjs` elenca ogni occorrenza e segnala i valori non canonici; la procedura in admin è in `docs/shopify/verifica-promesse.md`.
- **Valori canonici verificati (11/11/2026)**: 120 € e 14 giorni allineati. `FREE_SHIPPING_FROM = 120` in `lib/shop/catalog.ts` coincide con il tema; `SELLER.withdrawalDays = 14` coincide con la pagina legale `app/legale/spedizioni-e-resi`. **Tema corretto in locale (11/11/2026)**: `shopify-theme/sections/main-product.liquid` riga 127 e `templates/product.json` riga 6 ora dicono "Lavorazione 7–14 giorni · Spedizione 1–5 giorni Italia · Resi entro 14 giorni (spese a tuo carico)". Da deployare prima di pubblicare. Dettagli in `verifica-promesse.md` §0.
- **Decisioni ancora aperte** (da chiudere prima di eseguire la Fase 3): vedi §10.

---

## 1. Stati prodotto: cosa cambia per URL, ricerca e redirect

| Stato | URL pubblico | Ricerca / sitemap | Redirect possibile | Quando usarlo |
|---|---|---|---|---|
| **Active** | 200 | sì | no | il capo vende |
| **Unlisted** | 200, solo con link diretto (noindex/nofollow) | fuori da collezioni, ricerca, sitemap | **no** | link in email già inviate, early access, drop privato |
| **Draft** | **404** | fuori da tutto | **sì** | capo fuori catalogo da redirigere o da riportare |
| **Archived** | fuori dallo storefront | — | sì, ma Draft è lo stato documentato per il 404 | capo ritirato senza fretta, da conservare |

Regola: fuori catalogo con link in circolazione → **Draft + redirect**. Deve restare comprabile solo da chi ha il link → **Unlisted**, senza redirect.

---

## 2. Procedura di dismissione, in 8 fasi

### Fase 0 — Snapshot

1. Prodotti → **Esporta** CSV completo (backup di titoli, handle, prezzi, metafield).
2. Annota per ogni prodotto: handle, URL, collezioni, template assegnato, presenza nei menu.
3. Sconti → elenco/screenshot di automatici e codici con restrizioni prodotto.
4. Contenuti → Menu → **Visualizza redirect URL** → esporta la lista esistente.
5. Se hai Flow attivo, controlla che nessun workflow ripubblichi prodotti.

### Fase 1 — Classificazione

| Secchio | Azione | Destinazione |
|---|---|---|
| Vende | resta Active | — |
| Torna la prossima stagione | Draft, oppure Unlisted se ha link esterni | nessuna |
| Sostituito da un nuovo capo | Draft | il nuovo prodotto |
| Morto | Draft → dopo 90 giorni valuta eliminazione | collezione di categoria |

### Fase 2 — Mappa le dipendenze (9 punti)

1. Collezioni (resta membro anche da Draft: se si svuota, la collezione resta live con 0 prodotti)
2. Menu header e footer
3. Sconti automatici con il prodotto in lista
4. Codici sconto con restrizione prodotto
5. Blocchi hotspot del lookbook (`_hotspot-product`)
6. Sezioni con prodotti scelti manualmente
7. Metafield di tipo riferimento prodotto (es. look correlato)
8. Liquid con handle scritti a mano, incluso lo snippet del bundle
9. Fuori da Shopify: post social, link in bio, email già inviate, feed Merchant Center, QR stampati

### Fase 3 — Esecuzione, nell'ordine

1. Rimuovi da menu e da sezioni/collezioni in evidenza.
2. Aggiorna gli sconti (togli il prodotto o disattiva il codice).
3. Rimuovi blocchi hotspot e riferimenti nei metafield.
4. Imposta **Draft** (singolo, o Prodotti → seleziona → Azioni in blocco → Imposta come bozza).
5. **Subito dopo**: redirect creato a mano, importato dal CSV, o generato da Flow.
6. Verifica (Fase 6) prima di passare al prodotto successivo.

### Fase 4 — Redirect

Vedi §3 per regole, CSV e verifica.

### Fase 5 — Sconti

| Tipo | Effetto del Draft | Azione |
|---|---|---|
| Automatico "importo sui prodotti" con il capo in lista | non si applica più; se era l'unico, sconto inutile | togli il prodotto o disattiva |
| Automatico a livello ordine | continua a funzionare, ma il capo non è comprabile | verifica che le soglie abbiano senso sul catalogo ridotto |
| Codice limitato a quel prodotto | codice attivo ma inutilizzabile | disattiva o riassegna |
| Bundle app | componente mancante, bundle non vendibile | disattiva o sostituisci il componente |
| Acquista X ottieni Y | X sparito, promozione morta | disattiva |

Non riusare lo stesso sconto per il catalogo nuovo: nome con la data (`LOOK FW26`), così si spegne in un click.

### Fase 6 — Verifica

Vedi §7 (comandi) e §9 (checklist).

### Fase 7 — Dopo 60–90 giorni

- **Elimina** se il capo non torna: gli ordini passati conservano titolo e prezzo, ma i link al prodotto nelle email e nell'account cliente smettono di funzionare e le recensioni dell'app collegate si perdono.
- **Archivia** se vuoi solo togliere il prodotto dalla lista senza perdere nulla.
- In entrambi i casi il redirect resta valido perché punta a una pagina viva, non al prodotto rimosso.

---

## 3. Redirect: regole, CSV, verifica

### Il CSV da importare

File: `docs/shopify/redirects-shopify.csv` (intestazioni in inglese, richieste dall'importatore)

```csv
Redirect from,Redirect to
/products/pantalone-palazzo-flanella,/collections/all
```

Una sola riga, perché le decisioni sono chiuse (§10): cappotto e maglia restano con l'handle attuale, quindi non hanno bisogno di redirect e non potrebbero averlo, dato che il loro URL resta valido.

Aggiungi righe con lo stesso schema per gli altri prodotti:

| Caso | Riga |
|---|---|
| Sostituito da un nuovo capo | `/products/vecchio-handle,/products/nuovo-handle` |
| Dismesso, categoria che resta | `/products/vecchio-handle,/collections/categoria` |
| Dismesso, nessun sostituto | `/products/vecchio-handle,/collections/all` |
| Resta comprabile solo col link | nessuna riga: **Unlisted** |

### Regole

- Solo path relativi, senza dominio.
- La destinazione deve esistere e rispondere **200** (una collezione nascosta dal menu ma pubblicata va benissimo: nascosta ≠ 404).
- Un solo salto: niente redirect che punta a un altro redirect.
- Non mandare tutto alla home: manda al sostituto o alla collezione di categoria.
- Il redirect sparisce se l'URL torna valido (prodotto ripubblicato): va ricreato al ritiro successivo.
- Non cambiare l'handle dei prodotti che restano.
- Riusare l'handle del vecchio prodotto per quello nuovo rende l'URL di nuovo valido: i backlink atterrano sul nuovo capo, ma perdi recensioni e metafield del vecchio.
- Limite: 100.000 redirect per store. Path riservati non redirigibili in partenza: `/products`, `/collections`, `/collections/all`, `/apps/`, `/a/`.

### Import

Contenuti → Menu → **Visualizza redirect URL** → **Importa** → carica il CSV. Solo **dopo** aver messo i prodotti in bozza.

---

## 4. Automazione con Shopify Flow

Prerequisito: definizione metafield **`custom.redirect_to`** (Testo a riga singola o URL) compilata sui prodotti da dismettere. Se è vuota, il workflow A non parte — scelta voluta, evita redirect spazzatura.

### Workflow A (principale)

- **Trigger**: Product status updated
- **Condizioni**: `Product / Status` = `Draft` **e** `custom.redirect_to` esiste (se non è selezionabile, usa "Get product data" e condiziona il risultato)
- **Azione**: Create redirect URL
  - Path: `/products/{{ product.handle }}`
  - Target: `{{ product.metafields.custom.redirect_to.value }}`
  - Overwrite existing redirect: attivo

### Workflow B (fallback, senza metafield)

- **Condizioni**: `Status` = `Draft` **e** `custom.redirect_to` non esiste
- **Target**: `/collections/{%- assign first_collection = product.collections | first -%}{{ first_collection.handle }}`

Se il prodotto non è in nessuna collezione il target è vuoto e l'azione fallisce: aggiungi una condizione sulle collezioni o usa un target fisso.

### Via rapida

Apps → Flow → Create workflow → Templates → "Create redirect URLs when a product's status changes". Il template nasce su active → archived: porta la condizione su `Draft` e sostituisci Path/Target.

### Test

1. Duplica un prodotto → handle `test-dismissione` → metafield = `/collections/all`.
2. Mettilo Draft.
3. Flow → Activity / Run log: run positivo.
4. Visualizza redirect URL: c'è `/products/test-dismissione`.
5. `curl -sI .../products/test-dismissione` → 301 verso 200.
6. Ripubblicalo: il redirect deve sparire da solo.
7. Elimina prodotto di prova e redirect.

### Troubleshooting

| Sintomo | Causa probabile | Rimedio |
|---|---|---|
| "Path must be an existing URL" | il prodotto non dà ancora 404: status non applicato o ancora pubblicato sul canale | verifica Draft e rimozione dal canale Negozio online |
| Nessun run registrato | il trigger è "Product status updated": un prodotto creato come bozza non genera l'evento | corretto così |
| Redirect creato ma non funziona | l'URL è tornato valido: Shopify ha cancellato il redirect | ricrealo al ritiro successivo |
| Errore target vuoto | metafield assente e prodotto senza collezioni | target fisso o condizione |
| Redirect a catena | il target è a sua volta un redirect | punta a una pagina 200 definitiva |
| Modifica in blocco lenta | un evento per prodotto | controlla il run log prima di rifare a mano |

---

## 4bis. Avvisi automatici: bozza, esaurito, riassortimento

Tre workflow separati da quello dei redirect (§4). Regola anti-rumore: **avvisa solo sul cambio di stato**, non a ogni modifica. Si ottiene con un tag sentinella (`esaurito`, `dismissione`) che il workflow aggiunge e toglie.

### 4bis.1 Prerequisiti per i canali

**Slack**
1. Apps → Flow → aggiungi l'azione *Send Slack message* → **Connect** e autorizza Slack.
2. Nel canale di destinazione: dettagli canale → Integrations → Aggiungi app → **FlowBot**.
3. Nel campo canale: `#operazioni` per un canale con nome, oppure `$C03U0GHLGLG` (ID copiato dai dettagli) per un canale privato.

**Email interna** (alternativa o aggiunta)
- Azione *Send internal email*: destinatari separati da virgola, oggetto e messaggio. **L'indirizzo non accetta variabili**, oggetto e corpo sì.
- Il mittente è l'email del negozio: va impostata e autenticata in Impostazioni → Notifiche, altrimenti finisce in spam.

### 4bis.2 Workflow C — prodotto in bozza

- **Trigger**: Product status updated
- **Condizioni**: `Product / Status` = `Draft`
- **Azioni**:
  1. *Add product tags* → `dismissione`
  2. *Send Slack message* → `#operazioni`

Messaggio (mrkdwn):

```
:package: *Prodotto in bozza*
*{{product.title}}* — handle `{{product.handle}}`
Da fare: verifica redirect (§3) e sconti (§2 Fase 5).
```

Versione email: oggetto `[Shopify] Prodotto in bozza`, corpo con titolo e handle. Non inserire `product.onlineStoreUrl` come link: dopo la bozza quell'URL è un 404.

### 4bis.3 Workflow D — variante esaurita

- **Trigger**: Product variant inventory quantity changed
- **Condizioni**:
  - `productVariant.inventoryQuantity` **≤ 0** (oppure giacenza ≤ 0 della location che usi per gli ordini online)
  - `Product / Status` = `Active`
  - `Product / Tags` **non contiene** `esaurito` ← è questo che evita una raffica di messaggi
- **Azioni**:
  1. *Add product tags* → `esaurito`
  2. *Send Slack message* → `#magazzino`

```
:warning: *Esaurito*
*{{product.title}}* — {{productVariant.displayName}}
SKU {{productVariant.sku}} · location {{inventoryLevel.location.name}}
Rifornire o mettere in bozza.
```

Limiti da conoscere:
- Il trigger è **per variante**: un prodotto con 4 taglie esaurite genera 4 messaggi in momenti diversi. Con un aggiornamento massivo delle giacenze puoi ricevere molti avvisi in pochi minuti: se dà fastidio, aggiungi la condizione sul tag `campagna-fw26` per limitare ai capi in spinta.
- Con più location, filtra sulla location degli ordini online, altrimenti la variante risulta esaurita in negozio mentre è piena in magazzino.
- Flow **non sa** dire da solo "tutte le varianti esaurite": per un avviso a livello prodotto serve l'azione *Run code* o *Count* sulle varianti. Consiglio: avvisi per variante, valutazione umana.

### 4bis.4 Workflow E — tornato disponibile

- **Trigger**: Product variant inventory quantity changed
- **Condizioni**: `productVariant.inventoryQuantity` **> 0** **e** `Product / Tags` contiene `esaurito`
- **Azioni**: *Remove product tags* → `esaurito`, poi *Send Slack message*

```
:white_check_mark: *Tornato disponibile*
*{{product.title}}* — {{productVariant.displayName}} ({{productVariant.inventoryQuantity}} pz)
```

È il workflow che rende D sostenibile: senza la rimozione del tag, D avviserebbe una volta sola e non più al ri-esaurimento.

### 4bis.5 Test

1. Duplica un prodotto di prova, mettilo **Draft** → workflow C: messaggio Slack, tag `dismissione`, run verde nel log.
2. Sul prodotto di prova porta una variante a **0** → messaggio di esaurimento e tag `esaurito`.
3. Riporta la giacenza a **5** → workflow E: tag rimosso e messaggio di riassortimento.
4. Riporta a **0** → secondo avviso di esaurimento: conferma che il ciclo funziona.
5. Elimina prodotto di prova, tag e messaggi.

### 4bis.6 Errori tipici

| Sintomo | Causa | Rimedio |
|---|---|---|
| `channel_not_found` su Slack | FlowBot non è stato aggiunto al canale | Integrations → Add app → FlowBot |
| Nessuna email | mittente del negozio non impostato o non autenticato | Impostazioni → Notifiche |
| Email rifiutata | variabile Liquid nel campo destinatari | indirizzi fissi, virgola come separatore |
| Decine di messaggi | trigger per variante + modifica massiva | condizione sul tag, o esegui gli aggiornamenti in un momento controllato |
| Avviso su capi in bozza | manca la condizione sullo status | aggiungi `Status = Active` |
| Nessun avviso al ri-esaurimento | tag `esaurito` non rimosso | attiva il workflow E |

---

## 5. Collezioni per il catalogo ridotto

**Regola base**: una collezione resta in menu solo con **almeno 4 prodotti attivi**. Sotto quella soglia si nasconde (non si cancella), ma resta pubblicata se serve come destinazione di redirect.

| # | Collezione | Handle | Tipo | Condizione | In menu | Priorità |
|---|---|---|---|---|---|---|
| 1 | Drop FW26 | `drop-fw26` | Manuale | capi della campagna | Sì, prima voce | Alta |
| 2 | Nuovi arrivi | `new-arrivals` | Automatica | tag `nuovo` o data di pubblicazione | Sì | Alta |
| 3 | Felpe | `felpe` | Automatica | tag `felpe` | Sì | Alta |
| 4 | T-shirt | `t-shirt` | Automatica | tag `t-shirt` | Sì | Alta |
| 5 | Cappotti | `cappotti` | Automatica | tag `cappotti` | Solo con 4+ | Media |
| 6 | Maglieria | `maglieria` | Automatica | tag `maglieria` | Solo con 4+ | Media |
| 7 | Pantaloni | `pantaloni` | Automatica | tag `pantaloni` | Solo con 4+ | Media |
| 8 | Ultimi pezzi | `ultimi-pezzi` | Automatica | tag `last-chance` + disponibile | Footer | Media |
| 9 | Tutto | `all` | Automatica | tutti i prodotti | No | Bassa |
| 10 | Archivio | `archivio` | Manuale | capi dismessi, mai pubblicata | No | Bassa |

### Navigazione minima

Header: **Drop FW26 · Felpe · T-shirt · Tutto** — Felpe e T-shirt entrano in menu solo con 4+ prodotti: con il catalogo attuale (due capi) il menu resta `Drop · Tutto`, come già chiuso in §10.
Footer: Ultimi pezzi, Spedizioni e resi, Taglie, Contatti

### Quando una collezione si svuota

1. Toglila dai menu.
2. Togli il canale Negozio online → la pagina risponde 404.
3. Redirect `/collections/handle` verso la collezione padre o `/collections/all`.
4. Se torna: ripubblicala e ricrea il redirect solo al ritiro successivo.

### Filtri e ordinamento

- Filtri attivi solo con **8+ prodotti**.
- Drop e collezioni manuali: ordinamento manuale.
- Collezioni automatiche: best seller o data, non alfabetico.
- Non mettere in evidenza prodotti in bozza: il conteggio dei filtri diventa incoerente.

### Contenuti minimi

Immagine 1200×1600 con lo stesso rapporto per tutte, descrizione di 1–2 righe, SEO title e meta aggiornati quando cambia l'assortimento, template `collection` di default.

Testi pronti per le collezioni del catalogo ridotto, con conteggio caratteri: `docs/shopify/collezioni-testi.md`.
Copertine (brief immagine, alt, didascalie): `docs/shopify/collezioni-immagini.md`.

### Non fare

Non creare collezioni "in attesa di prodotti": diventano pagine vuote indicizzate.

---

## 5bis. Schede prodotto, metafield taglie e pubblicazione

### 5bis.1 Com'è fatta la pagina prodotto in Fabric

Non è una sequenza di sezioni: c'è **una sezione principale** (`product-information`) con due blocchi statici — galleria (`_product-media-gallery`) e colonna dettagli (`_product-details`) — dentro cui stanno tutti i blocchi del prodotto. Le altre sezioni del template sono aggiuntive.

Ordine consigliato per abbigliamento:

| # | Dove | Blocco | Ruolo |
|---|---|---|---|
| 1 | sezione | `product-information` | layout: `content-center-aligned`, media a sinistra, `gap 48`, sticky ATC attivo |
| 2 | gallery | `_product-media-gallery` | `media_presentation: grid`, `media_columns: two`, `zoom: true`, `hide_variants: true` |
| 3 | details | `group` → `text` H1 + `price` | titolo e prezzo, `show_sale_price_first` |
| 4 | details | `product-inventory` | "ultimi X disponibili" (soglia 5) |
| 5 | details | `variant-picker` | `variant_style: buttons`, `show_swatches: true` |
| 6 | details | `buy-buttons` | `stacking: true`, accelerated checkout |
| 7 | details | `text` | spedizione e resi, 2 righe |
| 8 | details | `popup-link` → `custom-liquid` | **tabella taglie** in drawer |
| 9 | details | `accordion` | vestibilità (aperta), composizione e cura, spedizione |
| 10 | details | `text` | descrizione, `type_preset: rte` |
| 11 | sezione | `disclosures` | conformità EU |
| 12 | sezione | `product-recommendations` | completamenti, 4 prodotti |

Note che evitano errori: `hide_variants: true` funziona **solo** se le immagini sono assegnate alle varianti in admin; `aspect_ratio: adapt` va bene solo se tutte le foto hanno lo stesso rapporto (4:5), altrimenti fissa un ratio.

### 5bis.2 Il metafield delle taglie

Definizione: **`custom.size_chart`**, tipo **Testo multiriga**. Contiene l'HTML della tabella, uno per prodotto. Vantaggio rispetto a un template per categoria: elimini il prodotto ed elimini la sua tabella, senza template orfani da mantenere.

Nel blocco `popup-link` (heading "Tabella taglie", `behavior: drawer`) inserisci un blocco `custom-liquid` con:

```liquid
{% if product.metafields.custom.size_chart != blank %}
  {{ product.metafields.custom.size_chart.value }}
{% else %}
  <p>Tabella taglie in arrivo: scrivici a care@tuostore.it.</p>
{% endif %}
```

Il guard serve perché il blocco non si può nascondere dall'editor: senza metafield mostrerebbe un drawer vuoto, che è peggio di un messaggio.

Struttura minima della tabella (HTML dentro il metafield):

```html
<table style="width:100%; font-size:0.9em; text-align:left;">
  <caption style="text-align:left; font-size:0.85em; opacity:0.7; padding-bottom:6px;">Misure del capo in cm.</caption>
  <thead><tr><th>Taglia</th><th>Petto</th><th>Vita</th><th>Fianchi</th></tr></thead>
  <tbody>
    <tr><td>M</td><td>96</td><td>76</td><td>104</td></tr>
  </tbody>
</table>
```

Regole di contenuto della tabella:
- Massimo 5–6 colonne: oltre, su mobile diventa illeggibile e non c'è scroll garantito.
- Dichiara sempre se sono **misure del capo** o del corpo, e l'unità.
- Una riga "come misurare" con 2 istruzioni concrete (capo disteso, moltiplicare per due le circonferenze).
- Stesse taglie del variant picker: una taglia in tabella che non esiste in vendita è un reso.

### 5bis.3 Swatch: prerequisito in admin

Gli swatch compaiono solo se i valori dell'opzione hanno una **definizione swatch** (colore esadecimale o immagine) nella scheda varianti. Se scrivi "Nero" come testo semplice vedrai un bottone con la scritta, non il pallino.

1. Prodotto → Varianti → opzione **Colore** → per ogni valore: swatch colore o immagine (100×100 del tessuto).
2. Assegna a ogni variante la sua immagine: serve a `hide_variants: true`.
3. `variant-picker`: `variant_style: buttons`, `show_swatches: true`.
4. Non usare insieme il blocco separato `swatches` e `show_swatches: true`: duplichi la stessa informazione.

### 5bis.4 Checklist di pubblicazione di una scheda

- [ ] Titolo ≤ 60 caratteri, con nome modello e materiale
- [ ] Handle definitivo, minuscolo, senza accenti, non riusato da un prodotto dismesso
- [ ] Prezzo e eventuale compare-at coerenti con gli sconti attivi (§2 Fase 5)
- [ ] Tipo prodotto e tag della tassonomia (§7)
- [ ] Almeno 3 immagini in 4:5, prima immagine il flat lay, **alt text su tutte**
- [ ] Varianti con swatch definiti e immagini assegnate per variante
- [ ] `custom.size_chart` compilato e drawer che si apre da mobile
- [ ] Accordion: vestibilità aperta, composizione e cura presenti, spedizione e resi presenti
- [ ] Descrizione breve (quick-add) + descrizione HTML in fondo alla colonna
- [ ] SEO title e meta description compilati
- [ ] Template assegnato: `product` di default, `product.lookbook` solo per i capi campagna
- [ ] Sticky ATC provato dopo lo scroll: mantiene la variante
- [ ] Prodotto **Active**, nella collezione giusta, presente in almeno una collezione automatica

### 5bis.5 Errori tipici sulla scheda

| Sintomo | Causa | Rimedio |
|---|---|---|
| Swatch assente, compare un bottone con il nome | valore variante senza definizione swatch | definisci colore o immagine swatch in admin |
| Le foto non cambiano cambiando colore | immagini non assegnate alle varianti, o `hide_variants` spento | assegna le immagini, attiva `hide_variants` |
| Drawer taglie vuoto | metafield non compilato | guard Liquid + fallback, o compila il metafield |
| Tabella illeggibile su mobile | troppe colonne | massimo 5–6 colonne, o rimuovi colonne secondarie |
| Taglie esaurite invisibili | impostazione del blocco varianti | mostra le taglie non disponibili disabilitate, non nasconderle |
| Griglia immagini che salta | `aspect_ratio: adapt` con foto di rapporti diversi | fissa un ratio e croppa uniforme |
| Tabella taglie sbagliata dopo un riordino | metafield copiato da un altro prodotto | rileggi la scheda tecnica prima di pubblicare |

---

## 5ter. Email: benvenuto e recupero carrello

Cinque email, due flussi. Testi pronti, con oggetto/preheader/CTA e conteggio caratteri: `docs/shopify/email-testi.md`.
Sequenza di lancio della campagna, con calendario e segmenti: `docs/shopify/email-lancio-fw26.md`.
Post e storie degli stessi giorni, con orari, alt text e link tracciati: `docs/shopify/social-lancio-fw26.md`.
Post-acquisto (ringraziamento e conferma spedizione): `docs/shopify/post-acquisto-testi.md` — non ripete soglie né giorni di reso, non perché siano incerti ma perché a ordine pagato non servono (i canonici sono 120 € / 14 giorni, `verifica-promesse.md` §0).

| Flusso | Email | Ritardo | Oggetto | CTA |
|---|---|---|---|---|
| Benvenuto | 1 | immediata | Benvenuto. Qui si scrive poco | Guarda il catalogo |
| Benvenuto | 2 (opzionale) | 3 giorni | Ogni stampa parte da un disegno | Vedi le felpe |
| Carrello | 1 | 1 ora | Il carrello è ancora lì | Completa l'ordine |
| Carrello | 2 | 22–24 ore | Le taglie che avevi scelto | Completa l'ordine |
| Carrello | 3 (solo se sconti) | 48 ore | Un codice, poi smettiamo | Usa il codice |

Regole non negoziabili:

- **Condizione di uscita**: il flusso carrello si interrompe quando l'ordine è pagato. Senza, il secondo promemoria arriva a chi ha già comprato.
- **Un solo CTA per email.** Il pulsante di recupero è il blocco fornito dall'automazione, non un URL copiato dall'admin.
- **Consenso**: in Italia il recupero carrello è marketing, quindi parte solo verso iscritti; disiscrizione e indirizzo fisico in ogni email.
- **Anteprima con nome presente e assente**: con `{{ customer.first_name }}` vuoto l'email deve iniziare con "Ciao,".
- **Nessuna promessa non verificabile**: niente riassortimenti promessi, niente "ultimi pezzi" se il magazzino non è corto.
- La terza email esiste solo se hai margine per scontare: è una decisione, non un default (§10).

Dove si configura: Marketing → **Automazioni** → "Abbandono carrello" e "Iscrizione cliente", ritardi 1 ora / 22–24 ore / 48 ore. Gli stessi testi valgono in Klaviyo o Brevo cambiando la sintassi delle variabili.

---

## 6. Metafield usati

| Metafield | Tipo | Uso |
|---|---|---|
| `custom.size_chart` | Testo multiriga (HTML tabella) | tabella taglie per prodotto, letta da `custom-liquid` nel drawer (§5bis.2) |
| `custom.redirect_to` | Testo a riga singola / URL | destinazione del redirect, letta dal workflow Flow |

Liquid per la tabella taglie: `{{ product.metafields.custom.size_chart.value }}`

---

## 7. Tag stabili

`felpe`, `t-shirt`, `cappotti`, `maglieria`, `pantaloni`, `accessori`, `nuovo`, `last-chance`, `campagna-fw26`

Minuscole, senza spazi, senza accenti, un solo significato per tag. Se rinomini un tag, aggiorna le condizioni delle collezioni automatiche nello stesso giorno.

---

## 8. Comandi di verifica

```bash
curl -sI https://tuostore.it/products/vecchio-handle | grep -iE "^(HTTP/|location)"
```

Atteso: `301` e **una sola** `location` verso una pagina `200`. Due `location` = catena da correggere.

```bash
# la destinazione risponde 200?
curl -s -o /dev/null -w "%{http_code}\n" https://tuostore.it/collections/maglieria
```

---

## 9. Registro e checklist

| Prodotto | Handle | Stato | Redirect | Destinazione | Sconti | Hotspot | Verificato il |
|---|---|---|---|---|---|---|---|
| Cappotto Doppiopetto | `cappotto-doppiopetto-lana` | **Active — resta** | — | — | ☐ | ☐ | |
| Dolcevita Merino | `dolcevita-coste-merino` | **Active — resta** | — | — | ☐ | ☐ | |
| Pantalone Flanella | `pantalone-palazzo-flanella` | Draft | ☐ | `/collections/all` | ☐ | ☐ | |

Checklist di chiusura:

- [ ] Ogni prodotto dismesso è Draft e ha un redirect verificato (301 → 200)
- [ ] Nessuna collezione vuota in menu; `all` pubblicata come fallback
- [ ] Filtri disattivati sotto 8 prodotti
- [ ] Sconti aggiornati, nessun codice morto
- [ ] Hotspot e sezioni manuali senza riferimenti orfani
- [ ] Flow redirect testato su prodotto di prova e attivo
- [ ] Avvisi testati: bozza, esaurito, riassortimento (§4bis)
- [ ] Ogni scheda pubblicata ha superato la checklist §5bis.4
- [ ] Email di benvenuto e carrello attive con condizione di uscita e consenso verificati (§5ter)
- [ ] Registro compilato

---

## 10. Decisioni

### Chiuse nella 1.3

1. **Cosa resta in catalogo**: restano **Cappotto** e **Dolcevita**, esce il **Pantalone**.
   Cappotto e dolcevita coprono due fasce di prezzo (390 e 130 €) e si vendono anche separatamente; il pantalone ha il rischio resi più alto (lunghezza, vita, caduta) e l'identità più debole rispetto al resto del brand.
2. **Handle invariati**: `cappotto-doppiopetto-lana` e `dolcevita-coste-merino` restano quelli attuali. Nessun cambio, nessun redirect, nessun link rotto. È la regola di §3 applicata alla lettera.
3. **Titoli descrittivi, senza numerazione**: "Cappotto Doppiopetto in Lana Vergine" e "Dolcevita a Coste in Merino". La numerazione 01/02/03 si introduce quando la linea è completa: su due capi invecchia subito e costringe a cambiare handle.
4. **Pantalone fuori catalogo**: Draft + redirect `/products/pantalone-palazzo-flanella` → `/collections/all`, con `custom.redirect_to` compilato così lo crea Flow (§4). **Non** verso `/collections/pantaloni`: resterebbe vuota, e un redirect verso una pagina con 0 prodotti è un vicolo cieco. Se arrivano altri pantaloni e la collezione arriva a 4 prodotti, si cambia destinazione.
5. **Sconto look completo a 3 pezzi**: da disattivare. Con due capi il trigger non esiste più; se serve una promozione, è cappotto + dolcevita a prezzo fisso, non un -10,6% su tre prodotti che non ci sono.
6. **Tabelle taglie**: metafield `custom.size_chart` per prodotto (§5bis.2), non app esterna.

Con due capi soli, la navigazione resta `Drop · Tutto` (più Felpe/T-shirt se già esistono): le collezioni `cappotti` e `maglieria` stanno sotto i 4 prodotti e restano fuori menu, come da regola §5.

### Ancora aperte

1. **Riferimento visivo**: gli screenshot del video non sono arrivati; il tono delle schede segue gli asset del progetto (stampe, fondo scuro, flat lay).
2. **Accesso admin**: assente, nulla di questo runbook è applicato allo store.
3. **Canale avvisi**: Slack o email interna (§4bis.1).
4. **Sostituto del pantalone**: se arriva un cargo o un altro fondo, handle nuovo e redirect invariato verso `/collections/all` finché la collezione non regge.
5. **Terza email carrello con sconto**: attivarla significa rinunciare a margine su carrelli che si sarebbero chiusi comunque. Default: no, due promemoria bastano.

---

## Appendice — Errori da non fare

1. Creare il redirect prima di mettere il prodotto in bozza: Shopify lo rifiuta.
2. Cambiare l'handle di un prodotto che resta in vendita: 404 a catena.
3. Mandare dieci prodotti dismessi tutti alla home: vicolo cieco per chi arriva da un link.
4. Eliminare subito invece di mettere in bozza: perdi recensioni, metafield e reversibilità.
5. Lasciare un blocco hotspot che punta a un prodotto dismesso: manda a 404.
6. Dimenticare di verificare il redirect: un 301 non testato è un 404 che scopri dal cliente.
