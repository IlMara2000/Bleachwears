# Deploy su Cloudflare (costo zero)

Il sito è compilato per Cloudflare Workers con OpenNext (`wrangler.jsonc`, `open-next.config.ts`).

## Collegamento via GitHub (consigliato, nessun token da gestire)

1. Cloudflare → **Workers & Pages → Create → Import a repository** e scegli `IlMara2000/bleachwears`.
2. Build command: `npm run cf:build`. Deploy command: `npx wrangler deploy`.
3. In **Settings → Variables and Secrets** inserisci le chiavi elencate in `.env.example`
   (le `NEXT_PUBLIC_*` come variabili, le altre come *secret*): Supabase, Stripe, Resend,
   provider immagini. Aggiungi `NEXT_PUBLIC_SITE_URL` con l'indirizzo pubblico del sito.
4. Stripe → Developers → Webhooks: punta l'endpoint a `https://<tuo-dominio>/api/stripe/webhook`
   e copia il nuovo `STRIPE_WEBHOOK_SECRET`.
5. Supabase: crea il progetto in regione UE, applica le migrazioni di `supabase/migrations/`.

## Prova locale

```bash
npm install
npm run cf:preview
```

## Note

- `sharp` non gira su Workers: se manca, il riferimento inviato al generatore Cloudflare
  AI viene usato così com'è (vedi `lib/stencil/provider.ts`). Il motore locale di `/bwslab`
  non ne ha bisogno.
- Il contatore giornaliero delle generazioni, senza Redis, è per istanza. Per un tetto
  davvero condiviso configura `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`
  (piano gratuito di Upstash).
