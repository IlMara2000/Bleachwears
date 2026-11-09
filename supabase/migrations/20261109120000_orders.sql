-- Ordini del checkout. Le righe sono scritte solo dal server con la service
-- role key: nessun accesso diretto dal browser.
create table if not exists public.orders (
  id text primary key,
  created_at timestamptz not null default now(),
  status text not null default 'request_received',
  customer jsonb not null default '{}'::jsonb,
  address jsonb not null default '{}'::jsonb,
  shipping_method text not null default 'standard',
  lines jsonb not null default '[]'::jsonb,
  subtotal_cents integer not null default 0,
  shipping_cents integer not null default 0,
  total_cents integer not null default 0,
  payment_provider text not null default 'manual',
  payment_ref text
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);

alter table public.orders enable row level security;
revoke all on public.orders from anon, authenticated;
