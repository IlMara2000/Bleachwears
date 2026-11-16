-- Segna quando la conferma d'ordine è stata presa in carico. Il webhook di
-- Stripe aggiorna la colonna solo se è ancora vuota (`confirmation_sent_at is
-- null`): due eventi in parallelo, anche su istanze diverse, non possono
-- mandare due email allo stesso cliente.
alter table public.orders
  add column if not exists confirmation_sent_at timestamptz;

comment on column public.orders.confirmation_sent_at is
  'Quando il webhook ha preso in carico la conferma via email. Null = non ancora inviata.';
