# Testi delle collezioni — catalogo ridotto

Descrizioni brevi, SEO title e meta description per le collezioni del runbook §5.
Campi da compilare in: Admin → Prodotti → Collezioni → (collezione) → sezione **Motore di ricerca**.

Regole applicate:
- descrizione **1–2 frasi**, massimo ~300 caratteri: oltre, i prodotti scendono sotto la piega
- nessun "benvenuti", nessun aggettivo decorativo, nessun claim non verificabile ("riassortimento", "qualità premium")
- SEO title ≤ 60 caratteri, meta ≤ 155 (il check automatico è nello script di verifica)
- la keyword della collezione ripetuta una volta sola, all'inizio

Stato secondo §10: in catalogo restano **cappotto** e **dolcevita**; `pantaloni` non si pubblica finché non ha 4 prodotti; `archivio` non si pubblica mai.

| Collezione | Handle | Pubblicare | In menu |
|---|---|---|---|
| Drop FW26 | `drop-fw26` | sì | sì, prima voce |
| Nuovi arrivi | `new-arrivals` | sì | sì |
| Felpe | `felpe` | sì | sì |
| T-shirt | `t-shirt` | sì | sì |
| Cappotti | `cappotti` | sì | no (1 prodotto) |
| Maglieria | `maglieria` | sì | no (1 prodotto) |
| Pantaloni | `pantaloni` | **no** | no |
| Ultimi pezzi | `ultimi-pezzi` | sì | footer |
| Tutto | `all` | sì | no (fallback redirect) |

---

### Drop FW26 · `drop-fw26`

**Descrizione** (92 caratteri):
> Cappotto e dolcevita della campagna FW26. Due capi, un abbinamento, disponibilità limitata.

**SEO title** (45):
Drop FW26: cappotto e dolcevita | Bleachwears

**Meta description** (144):
Il drop FW26 di Bleachwears: cappotto doppiopetto in lana vergine e dolcevita in merino. Disponibilità limitata, spedizione gratuita sopra 120 €.

---

### Nuovi arrivi · `new-arrivals`

**Descrizione** (79):
> Quello che è entrato in catalogo per ultimo. Se lo vedi qui, è appena arrivato.

**SEO title** (26):
Nuovi arrivi | Bleachwears

**Meta description** (128):
Gli ultimi capi entrati in catalogo da Bleachwears: felpe e t-shirt con stampe disegnate a mano, più i capi della campagna FW26.

---

### Felpe · `felpe`

**Descrizione** (97):
> Felpe in cotone pesante, taglio dritto, stampe disegnate a mano in un solo colore su fondo scuro.

**SEO title** (47):
Felpe con stampe disegnate a mano | Bleachwears

**Meta description** (146):
Felpe Bleachwears: cotone pesante, taglio dritto, stampe disegnate a mano in un solo colore. Spedizione gratuita sopra 120 €, resi entro 14 giorni.

---

### T-shirt · `t-shirt`

**Descrizione** (98):
> T-shirt in cotone pesante con stampa serigrafata sul davanti. Vestibilità dritta, spalle regolari.

**SEO title** (44):
T-shirt con stampe serigrafate | Bleachwears

**Meta description** (134):
T-shirt Bleachwears in cotone pesante con stampe serigrafate. Vestibilità dritta, un solo colore su fondo scuro. Resi entro 14 giorni.

---

### Cappotti · `cappotti`

**Descrizione** (105):
> Doppiopetto in lana vergine, spalla morbida, lunghezza al ginocchio. Il capo esterno della campagna FW26.

**SEO title** (30):
Cappotti in lana | Bleachwears

**Meta description** (150):
Cappotto doppiopetto in lana vergine: spalla morbida, due spacchi laterali, sotto il ginocchio. Nero, cammello, grigio ferro. Misure reali in tabella.

---

### Maglieria · `maglieria`

**Descrizione** (101):
> Merino extrafine 12 gauge, coste 2/2. Aderente per scelta, collo alto, zero volume sotto il cappotto.

**SEO title** (43):
Maglieria in merino extrafine | Bleachwears

**Meta description** (140):
Maglieria Bleachwears in merino extrafine 12 gauge: dolcevita a coste, vestibilità aderente. Nero, crema, verde oliva. Resi entro 14 giorni.

---

### Pantaloni · `pantaloni` — NON pubblicare ora

**Descrizione** (pronta per quando la collezione avrà 4 prodotti):
> Pantaloni a vita alta e gamba larga, con piega cucita. Taglio pensato per sneaker o tacco basso.

**SEO title** (40):
Pantaloni dal taglio largo | Bleachwears

**Meta description** (127):
Pantaloni Bleachwears a vita alta e gamba larga, piega frontale cucita. Flanella di lana, misure reali del capo in ogni scheda.

---

### Ultimi pezzi · `ultimi-pezzi`

**Descrizione** (91):
> Taglie e colori rimasti, senza riassortimento. Quando finiscono, il capo esce dal catalogo.

**SEO title** (43):
Ultimi pezzi e taglie rimaste | Bleachwears

**Meta description** (117):
Gli ultimi pezzi disponibili: taglie e colori rimasti dei capi Bleachwears. Finiti questi, il capo esce dal catalogo.

---

### Tutto · `all`

**Descrizione** (36):
> Tutto il catalogo, in un solo posto.

**SEO title** (26):
Tutti i capi | Bleachwears

**Meta description** (131):
Il catalogo completo di Bleachwears: felpe, t-shirt, cappotti e maglieria. Stampe disegnate a mano, spedizione gratuita sopra 120 €.

---

## Versione EN (solo collezioni in inglese)

| Collezione | Description | SEO title |
|---|---|---|
| Drop FW26 | The FW26 campaign: coat and rollneck. Two pieces, one look, limited availability. | FW26 drop: coat and rollneck \| Bleachwears |
| Nuovi arrivi | The latest pieces in the catalog. If it's here, it just landed. | New arrivals \| Bleachwears |
| Felpe | Heavyweight cotton hoodies, straight cut, single-colour prints drawn by hand on dark ground. | Hand-drawn print hoodies \| Bleachwears |
| T-shirt | Heavyweight cotton tees with a screen-printed graphic on the front. Straight fit. | Screen-printed tees \| Bleachwears |

## Note prima di pubblicare

1. **Claim da verificare**: "senza riassortimento" (Ultimi pezzi) e "disponibilità limitata" (Drop) sono promesse commerciali. Se conti di rifornire, togli la frase.
2. **Collezioni automatiche**: `felpe`, `t-shirt`, `cappotti`, `maglieria`, `ultimi-pezzi` dipendono dai tag di §7. Se i tag non esistono, la collezione è vuota e la descrizione non salva la pagina.
3. **Immagini**: una copertina 1200×1600 per ogni collezione visibile, con lo stesso rapporto. Una collezione con testo ma senza immagine sembra incompleta.
4. **Meta description**: se la lasci vuota Shopify usa un estratto della descrizione, che è più corto e meno efficace.
5. **Non cambiare gli handle**: sono destinazioni di redirect (§3).
6. **Copertine**: brief immagine, alt text e didascalie in `docs/shopify/collezioni-immagini.md`.
