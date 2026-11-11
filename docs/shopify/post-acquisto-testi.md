# Post-acquisto: pagina di ringraziamento e conferma spedizione

Due testi, un solo principio: dire al cliente **cosa sta succedendo davvero**. La produzione è su ordinazione — "ogni capo viene dipinto a mano dopo l'ordine: 7–14 giorni di lavorazione prima della spedizione" (`lib/shop/business.ts`, `PROCESSING_NOTE`), quindi la pagina di ringraziamento non deve far credere che il pacco sia già in viaggio.

**Cosa questi testi non dicono, di proposito**: la soglia di spedizione gratuita (120 €, da `FREE_SHIPPING_FROM` in `lib/shop/catalog.ts`) e i giorni di reso (14, da `SELLER.withdrawalDays` e dalla pagina legale). Non perché siano sbagliati, ma perché a ordine pagato non aggiungono nulla: chi ha comprato ha già visto le condizioni al checkout, e ripeterle qui sposta l'attenzione via da "cosa succede adesso".

Tono: frasi corte, seconda persona, nessun punto esclamativo, nessun "grazie per il tuo acquisto!".

---

## 1. Pagina di ringraziamento

Va subito dopo il checkout, quando l'ordine è appena stato pagato. Deve rispondere a una sola domanda: *e adesso?*

**Titolo** (15):
Ordine ricevuto

**Testo**:

```
Grazie.

Il capo non è ancora in viaggio: viene dipinto a mano dopo l'ordine.

Cosa succede adesso
1. Lavorazione — 7–14 giorni. Il capo viene dipinto, asciugato e controllato.
2. Spedizione — ti mandiamo un'email con il tracking appena parte.
3. Consegna — 1–5 giorni lavorativi in Italia: 1–2 con corriere espresso, 3–5 con posta tracciata.

Se hai scelto il ritiro a mano il punto 2 cambia: niente corriere, ti scriviamo per concordare luogo e orario quando il capo è pronto.

Se hai scelto la taglia sbagliata, rispondi all'email di conferma: finché il capo non entra in lavorazione, si cambia.
```

**CTA** (14):
Segui l'ordine

**Nota**: il pulsante deve puntare alla pagina di stato dell'ordine, quella che Shopify genera. Non aggiungere un secondo CTA ("torna al negozio"): chi ha appena pagato non deve essere spinto altrove.

**Versione corta** (se il checkout consente un solo blocco di testo):

```
Grazie. Il capo viene dipinto a mano dopo l'ordine: 7–14 giorni di lavorazione prima della spedizione. Ti scriviamo con il tracking appena parte.
```

### 1bis. Delta sul blocco che esiste già

In `app/CheckoutView.tsx` lo schermo di ringraziamento è già scritto: kicker "Pagamento ricevuto", titolo `È tuo. Adesso lo dipingiamo.`, un paragrafo con i 7–14 giorni, CTA `Torna al drop`. È in tono e non va riscritto da zero. Le differenze da sanare sono tre:

| Cosa c'è | Cosa serve |
|---|---|
| un solo paragrafo | il blocco `Cosa succede adesso` con i tre passaggi: lavorazione, spedizione, consegna (più la riga per il ritiro a mano) |
| titolo `È tuo. Adesso lo dipingiamo.` | va tenuto: dice la verità sul processo meglio di "Ordine ricevuto" |
| CTA `Torna al drop` | va tenuta finché non esiste una pagina di stato dell'ordine: non linkare una route che non c'è |

Sullo stesso schermo conviene non duplicare la riga resi: quella compare già nello stato `result` ("14 giorni sui capi non personalizzati, come da termini"), ed è corretta così.

## 2. Email di conferma spedizione

Sostituisce il testo introduttivo della notifica Shopify "Conferma spedizione". Il blocco prodotti e i dati di tracking restano quelli generati da Shopify.

**Oggetto** (23):
Il tuo ordine è partito

**Preheader** (35):
{{ order_name }} — tracking dentro.

**Corpo**:

```
Ciao {{ customer.first_name }},

il tuo ordine {{ order_name }} è partito.

Corriere: {{ fulfillment.tracking_company }}
Tracking: {{ fulfillment.tracking_numbers }}
{{ fulfillment.tracking_urls }}

Prima di partire è stato dipinto a mano. Se all'apertura qualcosa non ti convince, rispondi a questa email: lo guardiamo insieme.

[Segui il pacco]
```

**CTA** (14):
Segui il pacco

**Versione testo**:

```
Ciao,

il tuo ordine {{ order_name }} è partito.

Corriere: {{ fulfillment.tracking_company }}
Tracking: {{ fulfillment.tracking_numbers }}
{{ fulfillment.tracking_urls }}

Se all'apertura qualcosa non ti convince, rispondi a questa email.

Segui il pacco: {{ fulfillment.tracking_urls }}
```

**Variante per ritiro a mano** (sostituisce la conferma spedizione quando il metodo è "Ritiro a mano"):

```
Ciao {{ customer.first_name }},

il tuo ordine {{ order_name }} è pronto.

Da qui non parte nessun corriere: il capo ti aspetta in laboratorio. Rispondi a questa email con due giorni e un orario che ti vanno bene e ci siamo.

Se nel frattempo cambia qualcosa, scrivici qui.
```

Manda solo questa, non anche quella con il tracking: per il ritiro non ci sono variabili da riempire.

**Variante per ordini con più capi** (cappotto + dolcevita):

```
Ciao {{ customer.first_name }},

i tuoi capi sono partiti — ordine {{ order_name }}.

Corriere: {{ fulfillment.tracking_company }}
Tracking: {{ fulfillment.tracking_numbers }}

Sono stati dipinti a mano prima di partire. Se all'apertura qualcosa non ti convince, rispondi a questa email.
```

---

## 3. Cosa non scrivere in questi due testi

| Non scrivere | Perché |
|---|---|
| "Spedizione gratuita sopra 120 €" | è vera, ma è una condizione d'acquisto: a ordine pagato non serve e allunga il testo |
| "Resi entro 14 giorni" | il cliente l'ha già letta tra le condizioni: se va ripetuta, il posto è la conferma d'ordine, non il ringraziamento |
| "Il tuo ordine è in viaggio" nel ringraziamento | falso: la lavorazione dura 7–14 giorni |
| "Consegna in 24/48 ore" | incompatibile con la produzione su ordinazione |
| "Presto a casa tua" senza tracking | genera aspettative che non puoi controllare |
| Punti esclamativi e "Grazie mille!!" | fuori tono rispetto a tutto il resto del catalogo |

---

## 4. Timeline che il cliente deve capire

| Momento | Cosa vede il cliente | Cosa gli diciamo |
|---|---|---|
| Pagamento | pagina di ringraziamento | "non è ancora in viaggio, viene dipinto dopo l'ordine" |
| +7–14 giorni | email di conferma spedizione | "è partito", con corriere e tracking |
| +1–5 giorni (Italia) | pagina di tracking del corriere | nessun testo nostro |
| All'apertura | il capo | "se qualcosa non convince, rispondi" |

Il punto delicato è il primo: chi compra online si aspetta la spedizione in 24–48 ore. Dirlo subito, nella pagina di ringraziamento, evita l'email "dov'è il mio ordine" cinque giorni dopo.

---

## 5. Dove vanno

**Pagina di ringraziamento**

1. Solo se il pagamento tornasse sul checkout Shopify: Impostazioni → **Checkout** → Personalizza, campi di testo della sezione "Grazie".
2. In questo progetto il ringraziamento non è una pagina Shopify: è lo schermo dentro `app/CheckoutView.tsx`, il blocco che si attiva quando `paidReturn` esiste (intorno a riga 252) dopo la verifica su `/api/checkout/confirm`. Il testo va lì, e la versione corta è pensata per un blocco unico.
3. Le variabili Liquid non sono disponibili su tutte le configurazioni di checkout: usa il testo statico, non `{{ order_name }}`.

**Email di conferma spedizione**

1. Impostazioni → **Notifiche** → **Conferma spedizione** (cliente).
2. Sostituisci solo l'introduzione; lascia il blocco prodotti, l'indirizzo di spedizione e il tracking come sono generati da Shopify.
3. Verifica che le variabili (`{{ order_name }}`, `{{ fulfillment.tracking_company }}`, `{{ fulfillment.tracking_numbers }}`, `{{ fulfillment.tracking_urls }}`) siano quelle del tuo template: se una è vuota, il cliente legge una riga bianca.
4. Anteprima con un ordine di prova **prima** di attivare: un'email di spedizione con link rotto è peggio di nessuna email.

## 6. Test

- [ ] Ordine di prova: ringraziamento leggibile su mobile, senza scroll per capire i tempi
- [ ] CTA "Segui l'ordine" porta alla pagina di stato corretta
- [ ] Email di spedizione: tracking cliccabile e funzionante
- [ ] Variabili piene (nome, numero ordine, corriere, tracking)
- [ ] Nessun riferimento a soglie di spedizione o giorni di reso
- [ ] Testo alternativo presente, se lo strumento lo supporta
- [ ] Footer dell'email con disiscrizione e indirizzo fisico (per le email di servizio verifica comunque l'obbligo di dati del venditore, oggi vuoti in `lib/shop/business.ts`)
