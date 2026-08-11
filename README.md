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
NEXT_PUBLIC_SITE_URL=https://bleachwears.vercel.app
```

La publishable key può essere usata nel browser: le tabelle esposte devono comunque avere privilegi minimi e Row Level Security attiva. Non inserire mai secret key o `service_role` in variabili `NEXT_PUBLIC_*`.

## Database

Le migrazioni versionate sono in `supabase/migrations/`. Il catalogo mantiene un fallback locale, quindi l’interfaccia rimane navigabile anche se Supabase non è raggiungibile.

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push --linked
```

## Controlli

```bash
npm run lint
npm test
```
