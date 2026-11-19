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

### Cosa finisce nel negozio

Il database può contenere più capi di quelli che il listino conosce, ma i prezzi li ricalcola il checkout da `lib/shop/catalog.ts`. La home quindi filtra con `purchasableProducts()`: un capo senza prezzo di listino non viene offerto (sarebbe un ordine destinato al rifiuto) e il suo id compare nel log come `{"event":"catalog.unpriced","ids":[…]}`. Se il database non contiene nessun capo riconosciuto, resta il catalogo di riferimento invece di un negozio vuoto.

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
# 1. Gratis — Cloudflare Workers AI, una generazione al giorno
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

Ogni pagina ha il suo contatore: `/bwslab` stampa con il modello (stencil) e ricava la versione cartoon in locale dall'originale, `/bwslab/nfsw` esegue il prompt dell'utente. Il tetto è quindi uno per pagina, non uno in comune. Con entrambi i provider a chiave configurati vince Cloudflare; `STENCIL_PROVIDER` (`cloudflare` | `gemini` | `local`) forza una scelta. `STENCIL_DAILY_CAP` (default **1** per i provider a pagamento, nessun tetto per quello locale) mette un tetto alle generazioni giornaliere: il gettone viene preso prima di chiamare il modello, così una richiesta oltre il tetto viene rifiutata con 429 senza costare nulla. Se invece la generazione parte e fallisce, il gettone **torna indietro**: un errore del provider non consuma la generazione di oggi. Next legge `.env.local` solo all'avvio, quindi riavvia `npm run dev` dopo aver modificato il file.

### Creare il token Cloudflare

Serve un account Cloudflare gratuito: il piano free copre 10.000 neurons al giorno e una generazione ne consuma circa 1.500, quindi l'allowance arriverebbe a sei immagini. Il default del progetto resta però una generazione al giorno: alza `STENCIL_DAILY_CAP` solo se sai quanto vuoi spendere.

1. Nella dashboard vai su **AI › Workers AI** e seleziona **Use REST API**.
2. Seleziona **Create a Workers AI API Token**, controlla i permessi precompilati e conferma con **Create API Token**. Il valore viene mostrato una volta sola: copialo subito (resta comunque visibile in **My Profile › API Tokens**, dove puoi revocarlo).
3. Nella stessa pagina, sotto **Get Account ID**, copia l'**Account ID**: è una stringa di 32 caratteri, non è segreta ma senza di essa l'API non sa su quale account operare.
4. Incolla i due valori in `.env.local` come `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_API_TOKEN`, riavvia `npm run dev` e controlla che `/api/bwslab/status` riporti `"configured": true` con `"provider": "cloudflare"`.

Se invece di usare il template crei un token personalizzato, deve avere **Workers AI - Read** e **Workers AI - Edit** limitati al tuo account: con il solo Read le generazioni vengono rifiutate. Il token è un segreto: va in `.env.local` (già ignorato da git) e nelle Environment Variables di Vercel, mai nel codice né in una variabile `NEXT_PUBLIC_*`, che finirebbe nel browser.

Per sapere cosa sta usando il deploy senza indovinare: `curl -s localhost:3000/api/bwslab/status` restituisce provider, modello, risoluzione, budget residuo e commit in esecuzione.

Per provare che la pressa generi davvero c'è `node scripts/verifica-pressa.mjs [--base http://127.0.0.1:3000]`: manda un'immagine sintetica, controlla che torni un'immagine col frame di partenza e che il budget scenda di uno. Consuma una generazione vera (due con `--seconda`), quindi si lancia a mano e non fa parte di `npm test`.

## Prenotazioni che scadono da sole

Il contatore giornaliero non si fida del fatto che la richiesta torni. Ogni generazione prenota il suo gettone **con una lease di sei minuti** (`LEASE_MS` in `lib/stencil/budget.ts`): se l'immagine arriva, la rotta chiama `confirm()` e il gettone diventa un addebito per la giornata; se la funzione viene uccisa a metà — il caso che nessun `catch` può intercettare — nessuno conferma, la lease scade e il gettone torna da solo alla prima lettura successiva. Niente cron e niente callback da mantenere in vita.

La lease vive più a lungo della funzione apposta: le rotte dichiarano `maxDuration = 300`, quindi sei minuti lasciano margine oltre il momento in cui la piattaforma uccide il processo, senza liberare un gettone che una generazione ancora in corso sta usando. Il browser aspetta meno della funzione (`CLIENT_TIMEOUT_MS` = 290 s nella pressa del prompt, 240 s nel laboratorio): oltre quel tempo non ci sarebbe più nessuna risposta da attendere, e l'identificativo del tentativo resta salvato per ritirare l'immagine al retry.

## Schede prodotto

Ogni capo ha un URL suo — `/prodotti/serpenti`, non `/?sku=BW-T01` — generato da `app/prodotti/[slug]/page.tsx` a partire dal catalogo. Le pagine sono prerenderizzate (una per prodotto), dichiarano il proprio canonical, hanno titolo e descrizione propri e portano il JSON-LD `Product` con prezzo, valuta, disponibilità e link all'offerta: è il formato che permette a un motore di ricerca di mostrare il prezzo accanto al risultato. Prezzi e disponibilità vengono da `lib/shop/catalog.ts`, la stessa fonte che il checkout usa per fatturare, quindi quello che si legge nella scheda è quello che si paga.

Una slug sconosciuta risponde 404 (`notFound()`), e la sitemap elenca le sei pagine più le schede di tutti i prodotti.

## Archivio delle stampe

Una generazione al giorno rende caro un refresh: l'immagine viveva solo come blob in memoria e chiudere la scheda buttava via quello che il gettone aveva comprato. Ora ogni pressa tiene **l'ultima stampa** in IndexedDB (`lib/stencil/archive.ts`): risultato, immagine di partenza e parametri che l'hanno prodotta. Al caricamento la pagina li rilegge e mostra di nuovo il disegno, con la nota "Ripresa da questo browser", senza chiamare il modello.

Nessun account e nessun invio: i dati restano nello storage del browser. Un record per pressa (`lab`, `prompt`), quindi l'archivio non cresce; dopo sette giorni scade e viene rimosso. Se il browser è pieno si tiene l'immagine e si scarta l'input (l'input è più grande e serve solo a ristampare), e senza IndexedDB — modalità privata, dati bloccati — la pressa funziona lo stesso, semplicemente senza memoria. "Nuova immagine" cancella l'archivio.

L'identificativo della richiesta vive in `localStorage` per la stessa ragione: se la scheda viene chiusa mentre la pressa lavora, riaprendo la pagina il tentativo è ancora lo stesso e l'API restituisce l'immagine già prodotta invece di generarne una seconda.

## Conferma d'ordine via email

Quando Stripe conferma il pagamento, il webhook legge l'ordine e manda al cliente la conferma: prodotti, spedizione scelta, tempi di lavorazione e totale. Il testo dell'email è costruito in `lib/shop/email.ts` dai dati dell'ordine, con i nomi escapati, quindi quello che leggi nel codice è quello che riceve il cliente.

L'invio è una chiamata HTTP al provider transazionale (`POST /emails` con la chiave nel solo header `Authorization`), così non serve nessun SDK e funziona anche su runtime edge. Servono queste variabili in `.env.local` e nelle Environment Variables di Vercel:

```bash
RESEND_API_KEY=re_...
ORDER_FROM_EMAIL=Bleachwears <ordini@tuodominio.it>
ORDER_REPLY_TO=ciao@tuodominio.it   # opzionale
```

`ORDER_FROM_EMAIL` deve stare su un dominio verificato presso il provider: un mittente arbitrario viene rifiutato con 403. Senza `RESEND_API_KEY` o senza `ORDER_FROM_EMAIL` il negozio incassa normalmente, l'email viene saltata e nel log resta `{"event":"order.email","ok":false,"reason":"not-configured"}` — una conferma mancante non deve mai far fallire un pagamento riuscito.

Due cose da sapere: il webhook rilegge l'ordine dal database (`loadOrder`) perché su un deploy con più istanze l'evento può arrivare dove l'ordine non è in memoria, e la deduplica degli invii è per istanza, quindi un evento Stripe ritentato può produrre una seconda email. Il modo per chiuderlo è una colonna `confirmation_sent_at` con un aggiornamento condizionale.

## Controlli

```bash
npm run lint
npm test
```

## Hook pre-commit

Dopo il clone abilita il controllo che blocca il commit di file `.env*`:

```sh
./scripts/install-hooks.sh
```
