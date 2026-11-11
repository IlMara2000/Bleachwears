# Email: benvenuto e carrello abbandonato

Testi pronti per le automazioni email. Tono allineato al catalogo: frasi corte, niente aggettivi decorativi, un solo invito all'azione per email.

## Regole applicate

- Oggetto ≤ 45 caratteri (mobile taglia a ~40), preheader ≤ 90, un solo CTA
- 3 blocchi brevi al massimo: chi sei, cosa serve sapere, cosa fare
- Nessun "Gentile cliente", nessun "non perdere l'occasione", nessun conto alla rovescia finto
- Le promesse sono verificabili: misure in cm, spedizione gratuita sopra 120 €, resi 14 giorni
- **Consenso**: in Italia le email di marketing (anche il recupero carrello) richiedono iscrizione. Il benvenuto parte solo dopo signup; il carrello solo verso chi ha già dato consenso. Disiscrizione e indirizzo fisico in ogni email.

---

## 1. Benvenuto — email 1 (immediata)

**Oggetto** (29):
Benvenuto. Qui si scrive poco

**Preheader** (52):
Cosa trovi, come leggere le taglie, quando spediamo.

**Corpo**:

```
Ciao {{ customer.first_name }},

grazie per l'iscrizione. Da qui in poi ti scriviamo poco, e solo quando c'è qualcosa.

In catalogo: felpe e t-shirt con stampe disegnate a mano, più il cappotto e il dolcevita della campagna FW26. Pochi pezzi, scelti.

Tre cose che ti servono subito:
— le misure reali di ogni capo sono nella scheda, in centimetri
— spedizione gratuita sopra 120 €
— resi entro 14 giorni

[Guarda il catalogo]

Se hai un dubbio su una taglia, rispondi a questa email: legge una persona.
```

**CTA** (18):
Guarda il catalogo

**Versione testo**:

```
Ciao,

grazie per l'iscrizione. Ti scriviamo poco.

In catalogo: felpe e t-shirt con stampe disegnate a mano, più cappotto e dolcevita della campagna FW26.

Misure reali in cm nella scheda di ogni capo. Spedizione gratuita sopra 120 €. Resi entro 14 giorni.

Catalogo: {{ link_catalogo }}

Dubbi su una taglia? Rispondi a questa email.
```

---

## 2. Benvenuto — email 2 (giorno 3, opzionale)

Serve solo se hai qualcosa da raccontare: se non ce l'hai, non mandarla.

**Oggetto** (31):
Ogni stampa parte da un disegno

**Preheader** (57):
Drago, circo, ragno, moto: prima del capo c'è il disegno.

**Corpo**:

```
Ciao {{ customer.first_name }},

le stampe che vedi non sono immagini trovate: sono disegni fatti a mano, poi portati sul capo.

Un solo colore, fondo scuro, niente sfumature. È per questo che da vicino si vedono i tratti e da lontano si legge il soggetto.

[Vedi le felpe]

Se un soggetto ti interessa e non lo trovi, scrivicelo: capita che torni.
```

**CTA** (13):
Vedi le felpe

**Nota**: "capita che torni" è una promessa morbida. Se non riassortisci mai, sostituisci con "scrivicelo e ti diciamo se torna".

---

## 3. Carrello abbandonato — email 1 (dopo 1 ora)

**Oggetto** (23):
Il carrello è ancora lì

**Preheader** (47):
Con le taglie che avevi scelto. Nessuna fretta.

**Corpo**:

```
Ciao {{ customer.first_name }},

nel carrello: {{ elenco_prodotti }}.

Se ti sei fermato sulle taglie: nella scheda ci sono le misure del capo in centimetri, non quelle del corpo. Se sei tra due, prendi la più grande.

Se il dubbio è la stampa: è un disegno a mano, un solo colore su fondo scuro. Da vicino si vede il tratto.

[Completa l'ordine]
```

**CTA** (17):
Completa l'ordine

**Versione testo**:

```
Ciao,

nel carrello: {{ elenco_prodotti }}.

Misure del capo in cm nella scheda. Tra due taglie? Prendi la più grande.

Completa l'ordine: {{ link_checkout }}
```

---

## 4. Carrello abbandonato — email 2 (dopo 22–24 ore)

**Oggetto** (26):
Le taglie che avevi scelto

**Preheader** (55):
Abbiamo controllato: il carrello è ancora recuperabile.

**Corpo**:

```
Ciao {{ customer.first_name }},

il tuo carrello è ancora recuperabile: {{ elenco_prodotti }}.

I capi sono in quantità limitata: se una taglia è finita nel frattempo, nella scheda la vedi disabilitata e puoi chiederci quando torna.

[Completa l'ordine]
```

**CTA** (17):
Completa l'ordine

**Nota**: non scrivere "ultimi pezzi" se non è vero. La frase "quantità limitata" regge solo se il catalogo è davvero corto, come in questo caso.

---

## 5. Carrello abbandonato — email 3 (48 ore, solo se decidi di scontare)

Da attivare solo con margine. Se non vuoi scontare, salta questa email: due promemoria sono già il limite oltre il quale l'email diventa fastidio.

**Oggetto** (24):
Un codice, poi smettiamo

**Preheader** (58):
{{ discount_code }} vale su tutto il carrello, per 48 ore.

**Corpo**:

```
Ciao {{ customer.first_name }},

il carrello è ancora qui, e questa è l'ultima email che ti mandiamo sull'argomento.

Se ti serve un motivo in più: {{ discount_code }} — 48 ore, su tutto il carrello.

[Usa il codice]
```

**CTA** (13):
Usa il codice

**Nota**: "l'ultima email sull'argomento" va mantenuta. Se poi ne parte una quarta, la frase diventa una bugia e si vede.

---

## Variabili da adattare

| Segnaposto | Cosa metterci |
|---|---|
| `{{ customer.first_name }}` | nome del cliente. Se vuoto, l'email deve iniziare con "Ciao," — verifica l'anteprima con un contatto senza nome |
| `{{ elenco_prodotti }}` | blocco prodotti dell'automazione (nome, variante, immagine, prezzo) |
| `{{ link_checkout }}` | il pulsante/link di recupero carrello fornito dall'automazione, non un link scritto a mano |
| `{{ link_catalogo }}` | URL della collezione `all` |
| `{{ discount_code }}` | codice generato dall'automazione, se la usi |

In Shopify Email l'automazione "Abbandono carrello" fornisce già un pulsante di recupero: sostituisci il mio `[Completa l'ordine]` con quel blocco, non con un URL copiato dall'admin. Gli stessi testi funzionano in Klaviyo o Brevo cambiando la sintassi delle variabili.

## Dove si configura

1. Shopify → **Marketing → Automazioni** → crea "Abbandono carrello" e "Iscrizione cliente" (o usa i template di Shopify Email).
2. Imposta i ritardi: 1 ora, 22–24 ore, 48 ore.
3. **Condizione di uscita**: interrompi la sequenza quando l'ordine è pagato. Senza questa condizione mandi il promemoria a chi ha già comprato.
4. Inserisci oggetto, preheader, corpo e CTA; imposta la versione testo se il tuo strumento la supporta (migliora la consegna).
5. Prova su un indirizzo tuo, con un carrello vero, da mobile.

## Test prima di attivare

- [ ] Anteprima con nome cliente presente e assente
- [ ] Il link di recupero riapre il carrello con le varianti giuste
- [ ] I prezzi nel blocco prodotti corrispondono a quelli del carrello (sconti inclusi)
- [ ] Disiscrizione e indirizzo fisico presenti nel footer
- [ ] La sequenza si ferma dopo l'acquisto
- [ ] Nessuna email parte a chi non ha dato consenso
