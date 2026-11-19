-- Ordini del checkout su Cloudflare D1. Scritti solo dal server (binding DB).
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  status TEXT NOT NULL DEFAULT 'request_received',
  customer TEXT NOT NULL DEFAULT '{}',
  address TEXT NOT NULL DEFAULT '{}',
  shipping_method TEXT NOT NULL DEFAULT 'standard',
  lines TEXT NOT NULL DEFAULT '[]',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  payment_provider TEXT NOT NULL DEFAULT 'manual',
  payment_ref TEXT,
  confirmation_sent_at TEXT
);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);
