# Guida Gestione Temi Shopify — Bleachwears

## Accesso all'admin temi

**URL diretto:**
```
https://TUO-NEGOZIO.myshopify.com/admin/themes
```
(Sostituisci `TUO-NEGOZIO` con il tuo handle, es. `bleachwears`)

**Percorso menu:**
1. Login su https://www.shopify.com/login
2. Seleziona il negozio **Bleachwears**
3. Sidebar sinistra → **Negozio online** → **Temi**

---

## Cosa vedi nella pagina Temi

| Sezione | Descrizione |
|---|---|
| **Tema corrente** | Quello live, visibile ai clienti (ora: **Fabric** / famiglia Horizon) |
| **Libreria temi** | Temi installati ma non pubblicati (bozze, backup, vecchi) |
| **Azioni** (menu ⋮ su ogni tema) | Pubblica, Anteprima, Personalizza, Rinomina, Duplica, Elimina, Scarica file |

---

## Operazioni comuni

### Pubblicare un tema (metterlo live)
1. Trova il tema in **Libreria temi**
2. Click **Azioni → Pubblica**
3. Conferma → diventa il **Tema corrente**

### Anteprima senza pubblicare
- **Azioni → Anteprima** → apre il negozio in modalità anteprima (barra viola in alto)
- I clienti **non** vedono l'anteprima

### Personalizzare (editor visuale)
- **Personalizza** sul tema corrente → editor drag-and-drop (sezioni, blocchi, impostazioni)
- Salva → aggiorna subito il tema live

### Caricare un tema da file locale (zip)
1. **Aggiungi tema** → **Carica file zip**
2. Seleziona `shopify-theme.zip` (cartella tema compressa)
3. Attendi upload → appare in Libreria → **Pubblica** quando pronto

### Deploy via Shopify CLI (consigliato per sviluppo)
```bash
# Dalla cartella shopify-theme/
shopify theme push --store TUO-NEGOZIO.myshopify.com
# Poi in admin: Azioni → Pubblica sul tema pushato
```

### Deploy via GitHub (se integrazione attiva)
1. Collega repo in **Negozio online → Temi → Aggiungi tema → Da GitHub**
2. Push su branch collegato → deploy automatico
3. Pubblica dalla libreria

---

## Il tuo tema attuale: Fabric (Horizon)

**File modificati in locale (pronti per deploy):**
- `shopify-theme/sections/main-product.liquid` — riga 127: `shipping_note` default
- `shopify-theme/templates/product.json` — riga 6: `shipping_note` override

**Valore corretto:**
```
Lavorazione 7–14 giorni · Spedizione 1–5 giorni Italia · Resi entro 14 giorni (spese a tuo carico)
```

**Valore vecchio (errato):**
```
Spedizione in 24/48h · reso gratuito 30 giorni
```

---

## Checklist prima di pubblicare

- [ ] Tema testato in anteprima (desktop + mobile)
- [ ] `shipping_note` corretto su prodotto singolo
- [ ] Size chart via metafield `custom.size_chart` funzionante
- [ ] Pantalone Palazzo Flanella in **Bozza** (Draft)
- [ ] Redirect importato (`redirects-shopify.csv`)
- [ ] 4 Flow attivi (§4, §4bis RUNBOOK)
- [ ] Email programmate (§5ter RUNBOOK)
- [ ] Dati venditore compilati in `lib/shop/business.ts`

---

## Rollback rapido

Se il nuovo tema ha problemi:
1. Vai in **Temi**
2. Sul tema precedente (ancora in Libreria) → **Azioni → Pubblica**
3. Il vecchio tema torna live in secondi

---

## Note operative

- **Non modificare il tema live direttamente nell'editor** se hai file locali: le modifiche andrebbero perse al prossimo deploy
- Usa **Duplica** per creare una copia di sicurezza prima di grandi cambiamenti
- I file in `shopify-theme/` sono la **source of truth** — l'admin riflette ciò che deployi
- Per collaboratori: invita da **Impostazioni → Utenti e permessi** con permesso "Temi"