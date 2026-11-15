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
node scripts/genera-icone.mjs --with-og                            # aggiunge la card social
```

La card social (`public/og.png`, 1200×630) nasce dallo stesso script con `--with-og`: marchio a 300px su fondo `#171a1c`, etichetta del drop in `#f08a45`, wordmark in `#f5edde`, tagline e URL in `#cfc7ba` e `#8d867a`. Il marchio resta nell'inquadratura originale del sorgente, quindi la card non va ricomposta a mano. Senza `--out` anche lei finisce in `public/`.

Dopo una rigenerazione conviene ricontrollare `git status`: con i valori predefiniti i file devono uscire identici a quelli committati.

## Pressa (Stencil Lab)

`/bwslab` non ha bisogno di chiavi: incide l'immagine nel browser con il motore locale. `/bwslab/nfsw` (Prompt Press) invece manda l'immagine a un modello e richiede un provider configurato sul server: senza chiave ogni richiesta risponde **503** con il messaggio "manca la chiave del provider" e la pagina del lab mostra come rimediare.

Scegli una delle tre strade, tutta la configurazione sta in `.env.local` in locale e nelle Environment Variables del progetto su Vercel (dopo averle aggiunte serve un nuovo deploy):

```bash
# 1. Gratis — Cloudflare Workers AI, ~6 generazioni al giorno
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-token
CLOUDFLARE_MODEL=@cf/black-forest-labs/flux-2-klein-9b

# 2. A pagamento — Gemini Nano Banana 2.1 (~0,034 $ per immagine a 1K)
GEMINI_API_KEY=your-key
GEMINI_IMAGE_SIZE=1K

# 3. Nessuna chiave — ComfyUI sulla macchina che esegue il server
STENCIL_PROVIDER=local
COMFYUI_URL=http://127.0.0.1:8188
```

Con entrambi i provider a chiave configurati vince Cloudflare; `STENCIL_PROVIDER` (`cloudflare` | `gemini` | `local`) forza una scelta. `STENCIL_DAILY_CAP` (default 6) mette un tetto alle generazioni giornaliere. Next legge `.env.local` solo all'avvio, quindi riavvia `npm run dev` dopo aver modificato il file.

Per sapere cosa sta usando il deploy senza indovinare: `curl -s localhost:3000/api/bwslab/status` restituisce provider, modello, risoluzione, budget residuo e commit in esecuzione.

## Controlli

```bash
npm run lint
npm test
```
