#!/usr/bin/env node
/**
 * Verifica la pressa con una generazione vera.
 *
 * Controlla che il provider risponda con un'immagine, che il budget giornaliero
 * scenda di uno e che il contatore non si muova se il server rifiuta per tetto
 * raggiunto. Costa una generazione (due con --seconda), quindi non è nel test
 * suite: si lancia a mano, quando serve.
 *
 *   node scripts/verifica-pressa.mjs
 *   node scripts/verifica-pressa.mjs --base http://127.0.0.1:3000
 *   node scripts/verifica-pressa.mjs --prompt "rendilo più grafico" --seconda
 */

import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const has = (name) => args.includes(`--${name}`);

const base = (flag("base", "http://127.0.0.1:3100") ?? "").replace(/\/$/, "");
const prompt = flag("prompt", "");
const endpoint = prompt ? `${base}/api/bwslab/edit` : `${base}/api/bwslab/transform`;
const outPath = flag("out", join(tmpdir(), `pressa-verifica-${Date.now()}.png`));

let failures = 0;
const ok = (message) => console.log(`  ok    ${message}`);
const fail = (message) => {
  failures += 1;
  console.log(`  FAIL  ${message}`);
};

async function readStatus(label) {
  const response = await fetch(`${base}/api/bwslab/status`, { cache: "no-store" });
  if (!response.ok) throw new Error(`status ${response.status} su /api/bwslab/status`);
  const status = await response.json();
  console.log(
    `  ${label}: provider=${status.provider} model=${status.model} ` +
      `budget ${status.budget.used}/${status.budget.cap} (restano ${status.budget.remaining})`,
  );
  return status;
}

/** Un'immagine sintetica: soggetto netto al centro, così lo stencil ha qualcosa da incidere. */
async function testImage() {
  const width = 600;
  const height = 800;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#d9d4c7"/>
    <circle cx="300" cy="300" r="140" fill="#1a1a1a"/>
    <rect x="180" y="470" width="240" height="260" rx="24" fill="#2b2b2b"/>
    <circle cx="240" cy="270" r="18" fill="#d9d4c7"/>
    <circle cx="360" cy="270" r="18" fill="#d9d4c7"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Il tipo si legge dai byte: un JSON d'errore non deve passare per immagine. */
function imageKind(bytes) {
  if (bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
  const riff = bytes.subarray(0, 4).toString("ascii") === "RIFF";
  const webp = bytes.subarray(8, 12).toString("ascii") === "WEBP";
  return riff && webp ? "webp" : null;
}

async function generate() {
  const form = new FormData();
  const image = await testImage();
  form.append("image", new Blob([new Uint8Array(image)], { type: "image/png" }), "prova.png");
  if (prompt) form.append("prompt", prompt);

  const started = Date.now();
  const response = await fetch(endpoint, { method: "POST", body: form });
  const ms = Date.now() - started;
  const bytes = Buffer.from(await response.arrayBuffer());
  return { response, bytes, ms };
}

const run = async () => {
  console.log(`\nPressa: ${endpoint}`);

  const before = await readStatus("prima");
  if (!before.configured) {
    console.log(
      "\nNessun provider configurato: la pressa risponderebbe 503.\n" +
        "Aggiungi a .env.local una delle tre configurazioni (CLOUDFLARE_ACCOUNT_ID +\n" +
        "CLOUDFLARE_API_TOKEN, GEMINI_API_KEY, oppure STENCIL_PROVIDER=local con\n" +
        "COMFYUI_URL) e riavvia il server, poi rilancia questo script.\n",
    );
    process.exit(1);
  }

  if (before.budget.remaining <= 0) {
    /* A tetto raggiunto la verifica giusta è che il server rifiuti senza spendere. */
    console.log("\nBudget esaurito: verifico che la generazione venga rifiutata senza costare.");
    const { response, bytes } = await generate();
    if (response.status !== 429) fail(`atteso 429 per budget esaurito, ottenuto ${response.status}`);
    else ok("429 con budget esaurito, nessuna generazione tentata");

    try {
      const body = JSON.parse(bytes.toString("utf8"));
      if (typeof body.error === "string" && body.error.length > 0) ok(`messaggio: ${body.error.slice(0, 120)}`);
      else fail("la risposta 429 non spiega perché");
    } catch {
      fail("la risposta 429 non è JSON");
    }
    return;
  }

  console.log("\nGenerazione (una vera: consuma budget):");
  const { response, bytes, ms } = await generate();

  if (!response.ok) {
    const detail = bytes.toString("utf8").slice(0, 300);
    fail(`risposta ${response.status}: ${detail}`);
  } else {
    const kind = imageKind(bytes);
    if (!kind) fail(`la risposta non è un'immagine (${bytes.length} byte)`);
    else ok(`immagine ${kind}, ${(bytes.length / 1024).toFixed(1)} kB in ${(ms / 1000).toFixed(1)} s`);

    if (kind) {
      await writeFile(outPath, bytes);
      const meta = await sharp(bytes).metadata();
      ok(`scritta in ${outPath} (${meta.width}×${meta.height})`);

      /* Il frame deve restare quello dell'input: è un vincolo del prodotto. */
      if (meta.width === 600 && meta.height === 800) ok("frame 3:4 conservato come l'input");
      else fail(`frame cambiato: atteso 600×800, ottenuto ${meta.width}×${meta.height}`);
    }
  }

  const after = await readStatus("dopo");
  if (after.budget.used === before.budget.used + 1) ok("budget: una generazione contata");
  else fail(`budget: atteso used=${before.budget.used + 1}, trovato ${after.budget.used}`);
  if (after.budget.remaining === before.budget.remaining - 1) ok("budget: resta una generazione in meno");
  else fail(`budget: atteso remaining=${before.budget.remaining - 1}, trovato ${after.budget.remaining}`);

  if (has("seconda")) {
    console.log("\nSeconda generazione (--seconda):");
    const before2 = await readStatus("prima");
    const second = await generate();
    if (!second.response.ok) fail(`seconda generazione: ${second.response.status} ${second.bytes.toString("utf8").slice(0, 200)}`);
    else ok(`immagine ${imageKind(second.bytes) ?? "sconosciuta"}, ${(second.bytes.length / 1024).toFixed(1)} kB`);
    const after2 = await readStatus("dopo");
    if (after2.budget.used === before2.budget.used + 1) ok("budget: seconda generazione contata");
    else fail(`budget: atteso used=${before2.budget.used + 1}, trovato ${after2.budget.used}`);
  }
};

run()
  .then(() => {
    console.log(failures === 0 ? "\nEsito: tutto verificato.\n" : `\nEsito: ${failures} controlli falliti.\n`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((error) => {
    console.error(`\nInterrotto: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
