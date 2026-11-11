# Sequenza di lancio — drop FW26

Cinque email (più un reinvio ai non-aprenti), dieci giorni. Prodotto: **Cappotto Doppiopetto in Lana Vergine (390 €)** e **Dolcevita a Coste in Merino (130 €)**.

Regole ereditate da `email-testi.md`: oggetto ≤ 45 caratteri, un solo CTA, nessuna urgenza finta, nessuna promessa di riassortimento. Valori commerciali canonici (runbook §0): spedizione gratuita sopra **120 €**, resi entro **14 giorni**.

**Cosa questa sequenza non fa**: non sconta, non usa countdown, non annuncia "ultimi pezzi" se il magazzino è pieno, non cita il vecchio bundle a tre pezzi (non esiste più, §10).

---

## Calendario

| Data | Giorno | Ora | Email | Segmento | Obiettivo |
|---|---|---|---|---|---|
| 17/11 | martedì | 18:30 | 1 — Teaser | tutti gli iscritti | preparare l'apertura, scaldare il segmento attivo |
| 19/11 | giovedì | 10:00 | 2 — Lancio | tutti gli iscritti | vendite del primo giorno |
| 20/11 | venerdì | 18:30 | 2b — Reinvio non-aprenti | chi non ha aperto la 2 | recuperare il 60–70% che non ha visto |
| 22/11 | domenica | 18:30 | 3 — Focus cappotto | escludi chi ha già comprato | alzare lo scontrino sul capo da 390 € |
| 25/11 | mercoledì | 12:30 | 4 — Taglie | escludi chi ha già comprato | ridurre i resi e sbloccare chi è indeciso |
| 28/11 | sabato | 10:30 | 5 — Stato reale | escludi chi ha già comprato | chiudere il ciclo, solo se hai controllato le giacenze |

Orari: 18:30 per le email "di lettura" (dopo lavoro), 10:00 per il lancio (mattina, quando si apre il telefono), 12:30 per la pausa pranzo. Se hai dati storici, i tuoi orari battono questi.

---

## 1 — Teaser · martedì 17, 18:30

**Oggetto** (23):
Giovedì escono due capi

**Preheader** (43):
Cappotto e dolcevita. Non è una collezione.

**Corpo**:

```
Ciao {{ customer.first_name }},

giovedì escono due capi.

Un cappotto in lana vergine e un dolcevita in merino. Non è una collezione da quaranta pezzi: sono i due che mancavano.

Niente lista d'attesa, niente anteprima. Giovedì alle 10 sono online.

[Apri il sito]
```

**CTA** (12):
Apri il sito

**Nota**: nessun prezzo, nessun link al prodotto (che non esiste ancora come pagina pubblica). Serve a farti aprire la mail di giovedì, non a vendere.

---

## 2 — Lancio · giovedì 19, 10:00

**Oggetto** (21):
Il drop FW26 è online

**Preheader** (47):
Cappotto in lana vergine e dolcevita in merino.

**Corpo**:

```
Ciao {{ customer.first_name }},

il drop FW26 è online.

Cappotto Doppiopetto in Lana Vergine — 390 €
Lana vergine e cashmere, spalla morbida, 98 cm in taglia M. Nero, cammello, grigio ferro.

Dolcevita a Coste in Merino — 130 €
Merino extrafine 12 gauge, aderente, collo alto. Nero, crema, verde oliva.

Spedizione gratuita sopra 120 €, resi entro 14 giorni. Le misure di ogni capo sono nella scheda, in centimetri.

[Vedi il drop]
```

**CTA** (12):
Vedi il drop

**Nota**: due prodotti, due prezzi, nessun testo di contorno. Il link va alla collezione `drop-fw26`, non alla home.

---

## 2b — Reinvio ai non-aprenti · venerdì 20, 18:30

**Oggetto** (37):
Il drop è online (se non l'hai visto)

**Preheader** (45):
Due capi, niente altro. Cappotto e dolcevita.

**Corpo**:

```
Ciao {{ customer.first_name }},

ieri è uscito il drop FW26 e forse ti è passato sotto.

Cappotto in lana vergine, 390 €. Dolcevita in merino, 130 €. Due capi, niente altro.

[Vedi il drop]
```

**CTA** (12):
Vedi il drop

**Nota**: mandalo **solo** a chi non ha aperto la 2. Se il tuo strumento non ha il reinvio ai non-aprenti (in Shopify Email verificalo; Klaviyo ce l'ha), salta questa email: mandarla a tutta la lista è la via più rapida per perdere iscritti.

---

## 3 — Focus cappotto · domenica 22, 18:30

**Oggetto** (26):
Il cappotto, nel dettaglio

**Preheader** (46):
Spalla non costruita, 98 cm in M, due spacchi.

**Corpo**:

```
Ciao {{ customer.first_name }},

il cappotto merita due righe in più.

Doppiopetto con spalla non costruita: cade dritta senza sembrare rigida. Due spacchi laterali per camminare e salire in auto, sei bottoni di cui due di chiusura, fodera in cupro.

Lunghezza 98 cm in M: al ginocchio su 180 cm. Se sei tra due taglie e lo porti sopra una giacca, prendi la grande.

Nella scheda c'è la tabella con petto, spalle, manica e lunghezza. Sono misure del capo, non del corpo.

[Apri la scheda]
```

**CTA** (14):
Apri la scheda

**Nota**: è l'email che vende il capo da 390 €. Tutto il resto del messaggio serve a togliere i due dubbi che bloccano l'acquisto: la lunghezza e la taglia.

---

## 4 — Taglie · mercoledì 25, 12:30

**Oggetto** (19):
Che taglia prendere

**Preheader** (41):
Aderente la maglia, regolare il cappotto.

**Corpo**:

```
Ciao {{ customer.first_name }},

la domanda che ci arriva di più: che taglia.

Nel dolcevita la vestibilità è aderente per scelta: deve stare sotto il cappotto senza fare pieghe. Se sei tra due taglie, prendi la più grande — il merino cede un po' con l'uso, non torna indietro.

Nel cappotto vale il contrario: regolare, e se ci metti una giacca sotto, sali di una.

Se hai ancora dubbi, rispondi a questa email con altezza e come ti piace portare i capi: ti diciamo la taglia.

[Guarda le misure]
```

**CTA** (16):
Guarda le misure

**Nota**: l'invito a rispondere è anche un test di deliverability: le risposte migliorano la reputazione del dominio.

---

## 5 — Stato reale · sabato 28, 10:30

Mandala **solo** dopo aver controllato le giacenze. Se è tutto disponibile, salta: un'email che dice "resta tutto" non serve a nessuno.

**Oggetto** (19):
Cosa resta del drop

**Preheader** (36):
Taglie disponibili, senza countdown.

**Corpo**:

```
Ciao {{ customer.first_name }},

una settimana dopo il lancio, lo stato reale:

{{ nome_capo }} — restano {{ taglie }}
{{ nome_capo }} — restano {{ taglie }}

Nessun conto alla rovescia: quando una taglia finisce la disattiviamo e basta. Se ti serve una taglia che non c'è, rispondi e ti diciamo se torna.

[Vedi cosa resta]
```

**CTA** (15):
Vedi cosa resta

**Nota**: i due segnaposto vanno compilati a mano con le taglie vere. Se scopri che tutto è pieno, sostituisci l'email con un semplice promemoria del drop o non mandarla.

---

## Oggetti alternativi (per A/B)

| Email | Alternativa | Caratteri |
|---|---|---|
| 1 — Teaser | Due capi, giovedì | 20 |
| 2 — Lancio | FW26: cappotto e dolcevita | 27 |
| 3 — Cappotto | Perché questo cappotto | 23 |
| 4 — Taglie | La taglia giusta, in due righe | 31 |
| 5 — Stato reale | Taglie rimaste, dette come stanno | 34 |

Testa **un solo oggetto per volta** e solo su liste sopra le 1.000 persone: sotto quella soglia la differenza è rumore.

---

## Prima di programmare

1. **Segmenti**: per le email 3–5 escludi chi ha già comprato nel periodo della campagna. Su un catalogo di due prodotti, chi ha comprato ha comprato tutto.
2. **Link tracciati**: `utm_source=email&utm_medium=newsletter&utm_campaign=fw26&utm_content=e1…e5`, così distingui il contributo di ogni email.
3. **Consenso**: solo iscritti; disiscrizione e indirizzo fisico nel footer di ogni email.
4. **Anteprima con nome assente**: `{{ customer.first_name }}` vuoto deve produrre "Ciao,".
5. **Coerenza con il sito**: prezzi, taglie e disponibilità nell'email devono coincidere con la scheda il giorno dell'invio. Se cambi un prezzo su Shopify, ricontrolla le email programmate.
6. **Cosa misurare**: apertura, click, conversioni, disiscrizioni. Non inseguire un tasso "giusto": guarda la curva tra la prima e la quinta email e taglia quello che non funziona.
