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

test("ships a bento identity, installable assets and a safe Supabase catalog migration", async () => {
  const [manifest, migration, envExample, app, styles] = await Promise.all([
    readFile(new URL("public/manifest.webmanifest", root), "utf8"),
    readFile(new URL("supabase/migrations/20260803101430_initial_catalog.sql", root), "utf8"),
    readFile(new URL(".env.example", root), "utf8"),
    readFile(new URL("app/BleachwearsApp.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  assert.match(manifest, /"display": "standalone"/);
  assert.match(envExample, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /to anon, authenticated\s+using \(active = true\)/i);
  assert.match(migration, /grant select on table public\.products to anon, authenticated/i);
  assert.doesNotMatch(migration, /grant (insert|update|delete).* to anon/i);
  assert.match(migration, /'patchwork', 'ribbon', 'index', 'seam', 'frame', 'sample'/);
  assert.doesNotMatch(migration, /#d9ff00|halo-burn|ghost-signal|void-bloom/);
  assert.match(app, /Catalogo live/);
  assert.match(styles, /\.home-board/);
  assert.match(styles, /--mint: #a8efcf/);
  assert.match(styles, /\.shape-patchwork/);
  assert.doesNotMatch(styles, /Impact|--paper|--red:|--acid:|\.ticker|hero-sticker|7px 7px 0/);
  assert.doesNotMatch(app, /MANIFESTO_001|portal-card|ONE\\s*OF\\s*ONE|↗|Orbita 01|Soft Bloom/);

  await Promise.all([
    access(new URL("public/favicon.png", root)),
    access(new URL("public/apple-touch-icon.png", root)),
    access(new URL("public/icon-192.png", root)),
    access(new URL("public/icon-512.png", root)),
    access(new URL("public/icon-512-maskable.png", root)),
    access(new URL("public/og.png", root)),
  ]);
});
