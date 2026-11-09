import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("is configured as a Vercel-compatible Next.js app", async () => {
  const [packageJson, page, layout] = await Promise.all([
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
  ]);

  assert.match(packageJson, /"build": "next build"/);
  assert.match(packageJson, /"@supabase\/supabase-js": "2\.112\.0"/);
  assert.doesNotMatch(packageJson, /vinext|wrangler|drizzle-orm/);
  assert.match(page, /BleachwearsApp/);
  assert.match(layout, /Bleachwears — Custom streetwear/);
});

test("ships the comic-ink identity, installable assets and a safe Supabase catalog", async () => {
  const [manifest, migration, envExample, app, styles] = await Promise.all([
    readFile(new URL("public/manifest.webmanifest", root), "utf8"),
    readFile(new URL("supabase/migrations/20260803101430_initial_catalog.sql", root), "utf8"),
    readFile(new URL(".env.example", root), "utf8"),
    readFile(new URL("app/BleachwearsApp.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  assert.match(manifest, /"display": "standalone"/);
  assert.match(manifest, /"orientation": "any"/);
  assert.match(envExample, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(envExample, /NEXT_PUBLIC_SUPABASE_CATALOG_ENABLED=false/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /to anon, authenticated\s+using \(active = true\)/i);
  assert.match(migration, /grant select on table public\.products to anon, authenticated/i);
  assert.doesNotMatch(migration, /grant (insert|update|delete).* to anon/i);
  assert.match(migration, /'patchwork', 'ribbon', 'index', 'seam', 'frame', 'sample'/);
  assert.doesNotMatch(migration, /#d9ff00|halo-burn|ghost-signal|void-bloom/);

  assert.match(app, /Catalogo live/);
  assert.match(app, /NEXT_PUBLIC_SUPABASE_CATALOG_ENABLED/);
  assert.match(app, /image\/heic/);
  assert.match(app, /@\/lib\/shop\/catalog/);
  assert.match(app, /ProductSheet/);
  assert.match(app, /CheckoutView/);
  assert.match(app, /legale\/termini/);
  assert.doesNotMatch(app, /MANIFESTO_001|portal-card|ONE\s*OF\s*ONE|Orbita 01|Soft Bloom/);

  assert.match(styles, /\.home-board/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.match(styles, /100dvh/);
  assert.match(styles, /--canvas: #f2e7d3/);
  assert.match(styles, /--acid: #efb53c/);
  assert.match(styles, /--hot: #c0272d/);
  assert.match(styles, /--paper: #f5edde/);
  assert.match(styles, /\.shape-patchwork/);
  assert.match(styles, /\.product-sheet/);
  assert.match(styles, /\.checkout-layout/);
  assert.match(styles, /\.legal-body/);
  assert.doesNotMatch(styles, /--mint: #a8efcf|halo-burn|#d9ff00/);

  await Promise.all([
    access(new URL("public/favicon.png", root)),
    access(new URL("public/apple-touch-icon.png", root)),
    access(new URL("public/icon-192.png", root)),
    access(new URL("public/icon-512.png", root)),
    access(new URL("public/icon-512-maskable.png", root)),
    access(new URL("public/og.png", root)),
  ]);
});

test("prices orders on the server and keeps the orders table private", async () => {
  const [catalog, route, store, ordersMigration] = await Promise.all([
    readFile(new URL("lib/shop/catalog.ts", root), "utf8"),
    readFile(new URL("app/api/checkout/route.ts", root), "utf8"),
    readFile(new URL("lib/shop/orders.ts", root), "utf8"),
    readFile(new URL("supabase/migrations/20261109120000_orders.sql", root), "utf8"),
  ]);

  assert.match(catalog, /export const fallbackProducts/);
  assert.match(catalog, /export function priceLine/);
  assert.match(catalog, /export function computeTotals/);
  assert.match(catalog, /FREE_SHIPPING_FROM/);
  assert.match(catalog, /CUSTOM_BASE = \{ "custom-tee": 49, "custom-hoodie": 89 \}/);

  assert.match(route, /priceLine\(/);
  assert.match(route, /computeTotals\(/);
  assert.match(route, /STRIPE_SECRET_KEY/);
  assert.match(store, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(route, /unitPrice\s*:\s*text\(/);

  assert.match(ordersMigration, /create table if not exists public\.orders/i);
  assert.match(ordersMigration, /enable row level security/i);
  assert.match(ordersMigration, /revoke all on public\.orders from anon, authenticated/i);
});

test("creates and verifies card payments on the server only", async () => {
  const [stripe, route, confirm, webhook, checkoutView, app, envExample] = await Promise.all([
    readFile(new URL("lib/shop/stripe.ts", root), "utf8"),
    readFile(new URL("app/api/checkout/route.ts", root), "utf8"),
    readFile(new URL("app/api/checkout/confirm/route.ts", root), "utf8"),
    readFile(new URL("app/api/stripe/webhook/route.ts", root), "utf8"),
    readFile(new URL("app/CheckoutView.tsx", root), "utf8"),
    readFile(new URL("app/BleachwearsApp.tsx", root), "utf8"),
    readFile(new URL(".env.example", root), "utf8"),
  ]);

  assert.match(stripe, /api\.stripe\.com\/v1/);
  assert.match(stripe, /createHmac\("sha256", secret\)/);
  assert.match(stripe, /timingSafeEqual/);
  assert.match(stripe, /toleranceSeconds/);
  assert.match(stripe, /\{CHECKOUT_SESSION_ID\}/);
  assert.match(stripe, /Idempotency-Key/);
  assert.match(stripe, /metadata\[order\]/);
  assert.match(route, /createCheckoutSession/);
  assert.match(route, /saveOrder/);
  assert.match(confirm, /retrieveCheckoutSession/);
  assert.match(confirm, /markOrderStatus\(orderId, "paid"/);
  assert.match(webhook, /STRIPE_WEBHOOK_SECRET/);
  assert.match(webhook, /verifyStripeSignature/);
  assert.match(envExample, /STRIPE_WEBHOOK_SECRET=/);

  /* La chiave segreta non deve mai finire nel codice che arriva al browser. */
  assert.doesNotMatch(checkoutView, /STRIPE_SECRET_KEY|api\.stripe\.com/);
  assert.doesNotMatch(app, /STRIPE_SECRET_KEY|api\.stripe\.com/);
});

test("renders the legal pages with shipping data from the shared catalog", async () => {
  const [terms, shipping, privacy] = await Promise.all([
    readFile(new URL("app/legale/termini/page.tsx", root), "utf8"),
    readFile(new URL("app/legale/spedizioni-e-resi/page.tsx", root), "utf8"),
    readFile(new URL("app/legale/privacy/page.tsx", root), "utf8"),
  ]);

  assert.match(terms, /art\. 59/);
  assert.match(terms, /Diritto di recesso/);
  assert.match(shipping, /SHIPPING_METHODS/);
  assert.match(shipping, /FREE_SHIPPING_FROM/);
  assert.match(privacy, /Titolare del trattamento/);
  assert.match(privacy, /art\. 6\.1\.b GDPR/);
  assert.match(privacy, /Cookie/);
});
