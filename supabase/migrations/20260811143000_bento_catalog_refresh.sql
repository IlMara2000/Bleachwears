begin;

alter table public.products
  drop constraint if exists products_art_check;

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

alter table public.products
  add constraint products_art_check
  check (art in ('patchwork', 'ribbon', 'index', 'seam', 'frame', 'sample'));

commit;
