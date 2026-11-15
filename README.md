# Bleachwears

Web app bento-grid per Bleachwears: link hub, catalogo drop e configuratore interattivo per t-shirt e felpe personalizzate con candeggina.

## Stack

- Next.js 16 e React 19
- Supabase per il catalogo prodotti, con Data API e RLS
- Vercel per preview e produzione

## Avvio locale

Richiede Node.js 24.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Impostare in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
NEXT_PUBLIC_SUPABASE_CATALOG_ENABLED=false
NEXT_PUBLIC_SITE_URL=https://bleachwears.vercel.app
```

La publishable key può essere usata nel browser: le tabelle esposte devono comunque avere privilegi minimi e Row Level Security attiva. Non inserire mai secret key o `service_role` in variabili `NEXT_PUBLIC_*`.

Il catalogo usa i dati locali finché `NEXT_PUBLIC_SUPABASE_CATALOG_ENABLED` è `false`. Dopo aver applicato le migrazioni al progetto Supabase, impostarlo a `true` in locale e su Vercel per attivare la lettura live senza richieste fallite durante la configurazione iniziale.

## Database

Le migrazioni versionate sono in `supabase/migrations/`. Il catalogo mantiene un fallback locale, quindi l’interfaccia rimane navigabile anche se Supabase non è raggiungibile.

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push --linked
```

## Marchio e icone

Il marchio vive in un solo sorgente vettoriale, `logo-bw-square.svg`: da lì si rigenerano favicon, icone dell'app e logo dell'header. Il generatore usa `sharp` (già tra le dipendenze) e non richiede argomenti.

```bash
node scripts/genera-icone.mjs
```

Scrive in `public/`: `logo.png` (512, per header, footer e carrello), `favicon.png` (64), `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` e `apple-touch-icon.png` (180). Le icone restano trasparenti; maskable e apple-touch sono su fondo pieno perché iOS e Android non gestiscono l'alpha in quei casi.

Come funziona il ritaglio: i grigi scuri dello sfondo diventano trasparenti e i marroni del contorno restano, così i controfendi delle lettere sono buchi veri e non macchie scure. Se il marchio cambia forma, si ritoccano `--lum` e `--spread`.

Opzioni utili:

```bash
node scripts/genera-icone.mjs --margin 0.005 --logo-margin 0.02   # margine icone e margine del logo dell'header
node scripts/genera-icone.mjs --out /tmp/prova                     # scrive altrove, utile per confronti
node scripts/genera-icone.mjs --bg "#171a1c"                       # colore di fondo delle icone opache
```

La card social (`public/og.png`, 1200×630) non è prodotta dallo script: è composta a parte dal marchio a 300px su fondo `#171a1c`, con l'etichetta del drop in `#f08a45`, il wordmark in `#f5edde` e la tagline in `#cfc7ba`. `--with-og` genera invece una versione semplice con il solo marchio centrato, utile come base di partenza: scrive pure `og.png`, quindi senza `--out` sovrascrive la card in `public/`.

Dopo una rigenerazione conviene ricontrollare `git status`: con i valori predefiniti i file devono uscire identici a quelli committati.

## Controlli

```bash
npm run lint
npm test
```
