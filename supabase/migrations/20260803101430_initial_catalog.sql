begin;

create table if not exists public.products (
  id text primary key,
  slug text not null unique,
  name text not null,
  category text not null check (category in ('tee', 'hoodie', 'oneoff')),
  kind text not null,
  price_cents integer not null check (price_cents > 0),
  status text not null,
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  reaction text not null check (reaction ~ '^#[0-9a-fA-F]{6}$'),
  art text not null check (art in ('patchwork', 'ribbon', 'index', 'seam', 'frame', 'sample')),
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.products is
  'Catalogo pubblico Bleachwears. Le scritture restano riservate agli amministratori.';

alter table public.products enable row level security;

revoke all on table public.products from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on table public.products to anon, authenticated;
grant select, insert, update, delete on table public.products to service_role;

create index if not exists products_active_position_idx
  on public.products (position, id)
  where active = true;

drop policy if exists "Public can read active products" on public.products;
create policy "Public can read active products"
  on public.products
  for select
  to anon, authenticated
  using (active = true);

insert into public.products (
  id,
  slug,
  name,
  category,
  kind,
  price_cents,
  status,
  color,
  reaction,
  art,
  active,
  position
)
values
  ('BW-T01', 'mint-index', 'MINT INDEX', 'tee', 'Tee 240 g', 4900, '7–10 giorni', '#171717', '#d88954', 'patchwork', true, 10),
  ('BW-T02', 'soft-ribbon', 'SOFT RIBBON', 'tee', 'Tee 240 g', 5500, '7–10 giorni', '#4d1d29', '#e8aa83', 'ribbon', true, 20),
  ('BW-T03', 'night-index', 'NIGHT INDEX', 'tee', 'Tee oversized', 5900, 'Serie limitata', '#17223c', '#cfa361', 'index', true, 30),
  ('BW-H01', 'quiet-seam', 'QUIET SEAM', 'hoodie', 'Felpa 400 g', 8900, '10–14 giorni', '#151515', '#e2c090', 'seam', true, 40),
  ('BW-H02', 'field-frame', 'FIELD FRAME', 'hoodie', 'Felpa 400 g', 9900, 'Serie limitata', '#352018', '#d78a56', 'frame', true, 50),
  ('BW-O01', 'studio-sample-001', 'STUDIO SAMPLE 001', 'oneoff', 'Pezzo unico', 11900, '1 disponibile', '#22201f', '#c5bbff', 'sample', true, 60)
on conflict (id) do update
set
  slug = excluded.slug,
  name = excluded.name,
  category = excluded.category,
  kind = excluded.kind,
  price_cents = excluded.price_cents,
  status = excluded.status,
  color = excluded.color,
  reaction = excluded.reaction,
  art = excluded.art,
  active = excluded.active,
  position = excluded.position,
  updated_at = now();

commit;
