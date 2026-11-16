import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";

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

// Legge dimensioni e presenza del canale alpha dall'header IHDR, senza dipendenze.
function pngInfo(buffer) {
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "non è un PNG");
  assert.equal(buffer.subarray(12, 16).toString("ascii"), "IHDR");
  const colorType = buffer[25];
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    hasAlpha: colorType === 4 || colorType === 6,
  };
}

test("ships icons and a social card at the sizes and opacity the platforms require", async () => {
  const expected = [
    // iOS e le icone maskable non gestiscono la trasparenza: devono essere opache.
    ["favicon.png", 64, 64, true],
    ["logo.png", 512, 512, true],
    ["icon-192.png", 192, 192, true],
    ["icon-512.png", 512, 512, true],
    ["apple-touch-icon.png", 180, 180, false],
    ["icon-512-maskable.png", 512, 512, false],
    ["og.png", 1200, 630, false],
  ];

  for (const [name, width, height, hasAlpha] of expected) {
    const info = pngInfo(await readFile(new URL(`public/${name}`, root)));
    assert.equal(info.width, width, `${name}: larghezza`);
    assert.equal(info.height, height, `${name}: altezza`);
    assert.equal(info.hasAlpha, hasAlpha, `${name}: canale alpha`);
  }

  /* Le misure dichiarate nel manifest devono combaciare con i file, o il browser scarta l'icona. */
  const manifest = JSON.parse(await readFile(new URL("public/manifest.webmanifest", root), "utf8"));
  for (const icon of manifest.icons) {
    const info = pngInfo(await readFile(new URL(`public/${icon.src.replace(/^\//, "")}`, root)));
    assert.equal(`${info.width}x${info.height}`, icon.sizes, `${icon.src}: sizes del manifest`);
  }
});

const INK_BACKGROUND = [0x17, 0x1a, 0x1c];

// Quanto spazio occupa davvero il marchio: su fondo trasparente conta l'alpha,
// sulle icone opache conta la distanza dal colore di fondo.
async function markShape(buffer, transparent) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  let ink = 0;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * 4;
      const isInk = transparent
        ? data[offset + 3] > 200
        : Math.abs(data[offset] - INK_BACKGROUND[0]) +
            Math.abs(data[offset + 1] - INK_BACKGROUND[1]) +
            Math.abs(data[offset + 2] - INK_BACKGROUND[2]) > 48;
      if (!isInk) continue;
      ink += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  assert.ok(maxX >= 0, "icona vuota: nessun pixel di marchio");
  return {
    widthFill: (maxX - minX + 1) / info.width,
    coverage: ink / (info.width * info.height),
  };
}

test("keeps the mark big enough to read inside the small icons", async () => {
  /*
   * Soglie volutamente larghe: servono a intercettare un marchio rimpicciolito
   * per sbaglio (margini sbagliati, sorgente diverso), non a fissare il disegno.
   * Le icone opache stanno più basse perché il contenuto è dentro la zona sicura.
   */
  const cases = [
    ["favicon.png", true, 0.92, 0.42],
    ["logo.png", true, 0.9, 0.42],
    ["icon-192.png", true, 0.92, 0.42],
    ["icon-512.png", true, 0.92, 0.42],
    ["apple-touch-icon.png", false, 0.7, 0.24],
    ["icon-512-maskable.png", false, 0.72, 0.26],
    ["og.png", false, 0.7, 0.05],
  ];

  for (const [name, transparent, minWidthFill, minCoverage] of cases) {
    const shape = await markShape(await readFile(new URL(`public/${name}`, root)), transparent);
    assert.ok(
      shape.widthFill >= minWidthFill,
      `${name}: il marchio copre solo ${(shape.widthFill * 100).toFixed(1)}% della larghezza`
    );
    assert.ok(
      shape.coverage >= minCoverage,
      `${name}: inchiostro al ${(shape.coverage * 100).toFixed(1)}% dell'area`
    );
  }
});

test("answers 503 from both press endpoints before spending a generation", async () => {
  /* I due endpoint non condividono il modulo, quindi il patto si controlla qui. */
  for (const path of ["app/api/bwslab/edit/route.ts", "app/api/bwslab/transform/route.ts"]) {
    const source = await readFile(new URL(path, root), "utf8");
    const guard = source.indexOf("if (!isConfigured())");

    assert.ok(guard > 0, `${path}: manca il controllo della configurazione`);
    assert.match(source, /status: 503/, `${path}: la configurazione mancante non è un 503`);
    assert.match(
      source,
      /Il generatore non è configurato su questo deploy: manca la chiave del provider\./,
      `${path}: il messaggio non dice all'utente cosa manca`,
    );
    /* Il controllo deve precedere rate limit e generazione: nessun lavoro sprecato. */
    assert.ok(
      guard < source.indexOf("takeToken("),
      `${path}: il controllo arriva dopo il rate limit`,
    );
  }
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

test("counts one generation a day and gives the slot back when it fails", async () => {
  const budget = await readFile(new URL("lib/stencil/budget.ts", root), "utf8");

  /* Un provider locale non costa: solo quelli a pagamento hanno un default. */
  assert.match(budget, /activeProvider\(\) === "local" \? 0 : 1/, "il tetto di default non è una generazione al giorno");
  assert.match(budget, /refund\(\): Promise<void>/, "la prenotazione non sa restituire il gettone");
  /* L'ammissione condivisa deve essere atomica: controllo e incremento insieme. */
  assert.match(budget, /ADMIT_SCRIPT/, "manca lo script Lua che ammette a colpo sicuro");
  assert.match(budget, /if used >= cap then/, "lo script non confronta con il tetto");
  assert.match(budget, /\["EVAL", ADMIT_SCRIPT/, "lo script non viene eseguito sul contatore condiviso");
  assert.doesNotMatch(budget, /await refund\(\);\n\s*return \{ allowed: false/, "il rifiuto torna a rimediare con un rollback");
  /* Il rimborso deve colpire il giorno della prenotazione, non quello del guasto. */
  assert.doesNotMatch(budget, /dayKey\(Date\.now\(\)\)/, "il rimborso usa la data del momento: a cavallo della mezzanotte regala un gettone");
  assert.match(budget, /DECR/, "il contatore condiviso non sa scendere");
  assert.match(budget, /Math\.max\(0, entry\.count - 1\)/, "il contatore in memoria può andare sotto zero");

  for (const path of ["app/api/bwslab/edit/route.ts", "app/api/bwslab/transform/route.ts"]) {
    const source = await readFile(new URL(path, root), "utf8");
    const failure = source.indexOf("} catch (error)");

    assert.ok(failure > 0, `${path}: manca il ramo di errore`);
    assert.ok(
      source.indexOf("reservation.refund()", failure) > failure,
      `${path}: una generazione fallita resta conteggiata e costa`,
    );
  }
});

test("reuses a repeated request before spending a generation", async () => {
  for (const path of ["app/api/bwslab/edit/route.ts", "app/api/bwslab/transform/route.ts"]) {
    const source = await readFile(new URL(path, root), "utf8");
    const claim = source.indexOf("claimRequest(requestId)");

    assert.ok(claim > 0, `${path}: non legge l'identificativo della richiesta`);
    assert.ok(claim < source.indexOf("takeToken("), `${path}: il riuso arriva dopo il rate limit`);
    assert.ok(
      claim < source.indexOf("reserveGeneration()"),
      `${path}: il riuso arriva dopo la prenotazione, quindi costa un gettone`,
    );
    assert.ok(source.indexOf("completeRequest(") > claim, `${path}: non conserva il risultato per il retry`);
    assert.ok(source.indexOf("failRequest(requestId)") > claim, `${path}: un errore non libera l'identificativo`);
  }
});
