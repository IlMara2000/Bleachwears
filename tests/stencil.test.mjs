import assert from "node:assert/strict";
import test from "node:test";
import {
  StencilError,
  STENCIL_PROMPT,
  activeProvider,
  findImagePayload,
  isConfigured,
  nearestAspectRatio,
  readCloudflareImage,
  transformImage,
} from "../lib/stencil/provider.ts";
import { currentBudget, reserveGeneration } from "../lib/stencil/budget.ts";
import {
  claimRequest,
  completeRequest,
  failRequest,
  forgetAllRequests,
  requestIdFrom,
} from "../lib/stencil/idempotency.ts";
import { readDimensions, sniffKind } from "../lib/stencil/image-size.ts";

test("keeps the art direction that makes every result look like the same studio", () => {
  assert.match(STENCIL_PROMPT, /monochrome vector-stencil illustration/i);
  assert.match(STENCIL_PROMPT, /Preserve the original subject's identity/i);
  assert.match(STENCIL_PROMPT, /pure black backdrop/i);
  assert.match(STENCIL_PROMPT, /not a photograph with a filter applied/i);
  assert.match(STENCIL_PROMPT, /Avoid gradients, color, soft blur/i);
  assert.match(STENCIL_PROMPT, /Preserve the original framing and aspect ratio/i);
});

test("maps a frame to the nearest supported aspect ratio instead of cropping", () => {
  assert.equal(nearestAspectRatio(1024, 1024), "1:1");
  assert.equal(nearestAspectRatio(1000, 1500), "2:3");
  assert.equal(nearestAspectRatio(1500, 1000), "3:2");
  assert.equal(nearestAspectRatio(4000, 3000), "4:3");
  assert.equal(nearestAspectRatio(1080, 1920), "9:16");
  assert.equal(nearestAspectRatio(0, 0), "1:1");
});

test("finds the image whatever shape the provider answers with", () => {
  const payload = { data: "AAAABBBB", mime_type: "image/png" };

  assert.deepEqual(findImagePayload({ output_image: payload }), {
    data: "AAAABBBB",
    mimeType: "image/png",
  });
  assert.deepEqual(findImagePayload({ output: [{ type: "image", data: "ZZZZ", mime_type: "image/webp" }] }), {
    data: "ZZZZ",
    mimeType: "image/webp",
  });
  assert.deepEqual(
    findImagePayload({ candidates: [{ content: { parts: [{ inlineData: { data: "Q0ND", mimeType: "image/png" } }] } }] }),
    { data: "Q0ND", mimeType: "image/png" },
  );
  assert.equal(findImagePayload({ output_text: "no image here" }), undefined);
});

test("reports a missing provider as a 503 instead of a broken generation", async () => {
  /* Le chiavi si leggono a ogni chiamata, ma l'ambiente del test resta intatto. */
  const saved = {
    STENCIL_PROVIDER: process.env.STENCIL_PROVIDER,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  };
  for (const key of Object.keys(saved)) delete process.env[key];

  try {
    assert.equal(activeProvider(), undefined, "senza chiavi non esiste un provider attivo");
    assert.equal(isConfigured(), false);

    await assert.rejects(
      () =>
        transformImage({ bytes: Buffer.from("finta"), mimeType: "image/png", width: 64, height: 64 }),
      (error) => {
        assert.ok(error instanceof StencilError, "deve essere un errore del generatore, non un crash");
        assert.equal(error.status, 503, "il chiamante deve poter distinguere la configurazione mancante");
        assert.match(error.message, /non è configurato/i);
        return true;
      },
    );
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("reads the free provider's image whether it is bare base64 or a data URL", () => {
  assert.deepEqual(readCloudflareImage({ result: { image: "QUJD" } }), { data: "QUJD", mimeType: "image/png" });
  assert.deepEqual(readCloudflareImage({ result: { image: "data:image/jpeg;base64,REVG" } }), {
    data: "REVG",
    mimeType: "image/jpeg",
  });
  assert.equal(readCloudflareImage({ result: {} }), undefined);
  assert.equal(readCloudflareImage({ errors: [{ message: "boom" }] }), undefined);
});

test("reads the real type and size from the bytes, not the file name", () => {
  const png = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
  png.writeUInt32BE(800, 16);
  png.writeUInt32BE(600, 20);

  assert.equal(sniffKind(png), "png");
  assert.deepEqual(readDimensions(png, "png"), { width: 800, height: 600 });

  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80]);
  assert.equal(sniffKind(jpeg), "jpeg");
  assert.deepEqual(readDimensions(jpeg, "jpeg"), { width: 640, height: 480 });

  const webp = Buffer.alloc(30);
  webp.write("RIFF", 0, "latin1");
  webp.write("WEBP", 8, "latin1");
  webp.write("VP8X", 12, "latin1");
  webp.writeUIntLE(1023, 24, 3);
  webp.writeUIntLE(767, 27, 3);
  assert.equal(sniffKind(webp), "webp");
  assert.deepEqual(readDimensions(webp, "webp"), { width: 1024, height: 768 });

  assert.equal(sniffKind(Buffer.from("GIF89a not accepted at all")), undefined);
});

test("the local engine treats whatever owns the frame as background", async () => {
  const { backgroundLabel, subjectMask } = await import("../lib/stencil/local-core.ts");
  /* 4x4 frame: label 7 all around, label 15 in the middle. */
  const labels = new Uint8Array(16).fill(7);
  labels[5] = 15;
  labels[6] = 15;
  labels[9] = 15;
  labels[10] = 15;

  const background = backgroundLabel(labels, 4, 4);
  assert.equal(background, 7);
  const mask = subjectMask(labels, 4, 4, background);
  assert.equal(mask.data.reduce((sum, value) => sum + value, 0), 4);
  assert.equal(mask.data[5], 1);
});

test("the class in the middle of the frame stays the subject even when it fills an edge", async () => {
  const { backgroundLabel, centerLabel, labelMask } = await import("../lib/stencil/local-core.ts");
  /* 6x6: the person (15) runs across the whole bottom border, so the ring vote
     names the person as background. The middle of the frame must still win. */
  const labels = new Uint8Array(36).fill(7);
  for (let y = 2; y < 6; y += 1) {
    for (let x = 0; x < 6; x += 1) labels[y * 6 + x] = 15;
  }

  assert.equal(backgroundLabel(labels, 6, 6), 15, "the ring vote is fooled");
  const focus = centerLabel(labels, 6, 6);
  assert.equal(focus, 15);
  const mask = labelMask(labels, 6, 6, focus);
  assert.equal(mask.data[0], 0, "the top backdrop is dropped");
  assert.equal(mask.data[3 * 6 + 2], 1, "the subject survives");
});

test("a second object of the same class away from the middle is not cut with it", async () => {
  const { keepCenterComponent } = await import("../lib/stencil/local-core.ts");
  /* 8x4: the subject sits in the middle, a statue-shaped island on the right. */
  const width = 8;
  const height = 4;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    data[y * width + 3] = 1;
    data[y * width + 4] = 1;
    data[y * width + 7] = 1;
  }

  const kept = keepCenterComponent({ data, width, height });
  assert.equal(kept.data[1 * width + 3], 1, "the subject stays");
  assert.equal(kept.data[1 * width + 4], 1, "the subject stays");
  assert.equal(kept.data[1 * width + 7], 0, "the far island goes");
});

test("holes get closed so the poster has no white specks inside the figure", async () => {
  const { fillHoles } = await import("../lib/stencil/local-core.ts");
  const width = 7;
  const height = 7;
  const data = new Uint8Array(width * height);
  for (let y = 1; y < 6; y += 1) {
    for (let x = 1; x < 6; x += 1) data[y * width + x] = 1;
  }
  data[3 * width + 3] = 0;

  const filled = fillHoles({ data, width, height });
  assert.equal(filled.data[3 * width + 3], 1);
});

test("the stylized frame keeps four flat inks on black", async () => {
  const { STENCIL_TONES, stylize } = await import("../lib/stencil/local-core.ts");
  const width = 24;
  const height = 24;
  const rgba = new Uint8ClampedArray(width * height * 4);
  /* Four flat bands: the majority filter must not merge them into one ink. */
  const bands = [20, 100, 160, 240];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const shade = bands[Math.floor(x / 6)];
      const offset = (y * width + x) * 4;
      rgba[offset] = shade;
      rgba[offset + 1] = shade;
      rgba[offset + 2] = shade;
      rgba[offset + 3] = 255;
    }
  }
  const coverage = new Float32Array(width * height);
  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) coverage[y * width + x] = 1;
  }

  const out = stylize(rgba, coverage, width, height, { mode: "flat" });
  assert.equal(out[0], 0, "outside the mask stays pure black");

  const inks = new Set();
  for (let x = 2; x < width - 2; x += 1) inks.add(out[(10 * width + x) * 4]);
  for (const ink of inks) assert.ok(STENCIL_TONES.includes(ink), `unexpected ink ${ink}`);
  assert.equal(inks.size, 4, "luminance keeps four separate tones");
});

test("a stray chunk of background far from the body is not part of the cut", async () => {
  const { pruneDistantIslands } = await import("../lib/stencil/local-core.ts");
  const width = 40;
  const height = 10;
  const data = new Uint8Array(width * height);
  const fill = (from, to) => {
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = from; x <= to; x += 1) data[y * width + x] = 1;
    }
  };
  fill(2, 12); /* body */
  fill(14, 18); /* a hand, one pixel away */
  fill(30, 34); /* a flag in the background */

  const pruned = pruneDistantIslands({ data, width, height }, 0.05);
  const kept = (x) => pruned.data[5 * width + x];
  assert.equal(kept(6), 1, "the body stays");
  assert.equal(kept(16), 1, "a part that nearly touches the body stays");
  assert.equal(kept(32), 0, "an isolated object is dropped");
});

test("a square traced as vectors comes back as one closed loop", async () => {
  const { tracePolygons } = await import("../lib/stencil/vector-core.ts");
  const width = 5;
  const height = 5;
  const binary = new Uint8Array(width * height);
  for (let y = 1; y <= 3; y += 1) {
    for (let x = 1; x <= 3; x += 1) binary[y * width + x] = 1;
  }

  const loops = tracePolygons(binary, width, height, 0);
  assert.equal(loops.length, 1, "one shape, one loop");
  assert.equal(loops[0].length, 24, "twelve crack vertices make the outline");
});

test("smoothing rounds a polygon instead of moving it", async () => {
  const { smoothPolygon } = await import("../lib/stencil/vector-core.ts");
  const square = [0, 0, 10, 0, 10, 10, 0, 10];
  const smoothed = smoothPolygon(square, 1);
  assert.equal(smoothed.length, 16, "each corner becomes two points");

  let sumX = 0;
  let sumY = 0;
  for (let index = 0; index < smoothed.length; index += 2) {
    sumX += smoothed[index];
    sumY += smoothed[index + 1];
  }
  assert.ok(Math.abs(sumX / 8 - 5) < 0.001, "stays centred on the original shape");
  assert.ok(Math.abs(sumY / 8 - 5) < 0.001, "stays centred on the original shape");
});

test("refunds the day the slot was taken, not the day the failure lands", async () => {
  const realNow = Date.now;
  const at = (iso) => {
    Date.now = () => Date.parse(iso);
  };

  try {
    /* Il gettone viene preso sul contatore del giorno in corso. */
    at("2026-03-10T23:59:00.000Z");
    const taken = await reserveGeneration();
    assert.equal(taken.allowed, true);
    assert.equal(taken.budget.used, 1);

    /* La generazione attraversa la mezzanotte; il giorno nuovo ha il suo contatore. */
    at("2026-03-11T00:01:00.000Z");
    const next = await reserveGeneration();
    assert.equal(next.budget.used, 1, "il giorno nuovo deve partire da zero");

    /* Il guasto arriva dopo la mezzanotte: si rimborsa il 10 marzo, non l'11. */
    await taken.refund();

    assert.equal((await currentBudget()).used, 1, "il rimborso ha regalato una generazione al giorno nuovo");

    at("2026-03-10T23:59:30.000Z");
    assert.equal((await currentBudget()).used, 0, "il giorno della generazione fallita resta addebitato");
  } finally {
    Date.now = realNow;
  }
});

test("refunds a shared counter on the day the slot was taken, even across midnight", async () => {
  const redis = fakeRedis();
  const realNow = Date.now;
  const savedEnv = {
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  };

  process.env.KV_REST_API_URL = "https://kv.stub.local";
  process.env.KV_REST_API_TOKEN = "token-di-prova";
  const at = (iso) => {
    Date.now = () => Date.parse(iso);
  };

  try {
    at("2026-04-10T23:59:00.000Z");
    const taken = await reserveGeneration();
    assert.equal(taken.allowed, true);
    assert.equal(taken.budget.shared, true, "il test deve passare dallo store condiviso, non dalla memoria");

    at("2026-04-11T00:01:00.000Z");
    const next = await reserveGeneration();
    assert.equal(next.budget.used, 1, "il giorno nuovo deve partire da zero");

    await taken.refund();

    /* Il rimborso deve toccare il contatore del 10: nessun DECR sull'11. */
    const decremented = redis.commands.filter(([command]) => command === "DECR").map(([, key]) => key);
    assert.deepEqual(decremented, ["bwslab:spend:2026-04-10"]);

    assert.equal((await currentBudget()).used, 1, "il rimborso ha regalato una generazione al giorno nuovo");

    at("2026-04-10T23:59:30.000Z");
    assert.equal((await currentBudget()).used, 0, "il giorno della generazione fallita resta addebitato");

    /* Anche un rifiuto non deve consumare il contatore condiviso. */
    at("2026-04-11T00:02:00.000Z");
    const blocked = await reserveGeneration();
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.budget.used, 1, "il rifiuto ha lasciato il contatore sopra il tetto");
    assert.equal((await currentBudget()).used, 1, "il rifiuto ha consumato un gettone sul contatore condiviso");
  } finally {
    redis.restore();
    Date.now = realNow;

    if (savedEnv.url === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = savedEnv.url;

    if (savedEnv.token === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = savedEnv.token;
  }
});

test("a refused reservation costs nothing and leaves the counter at the ceiling", async () => {
  const realNow = Date.now;
  Date.now = () => Date.parse("2026-05-20T10:00:00.000Z");

  try {
    const first = await reserveGeneration();
    assert.equal(first.allowed, true);
    assert.equal(first.budget.used, 1);

    /* Con il tetto a uno la seconda richiesta dello stesso giorno viene rifiutata. */
    const refused = await reserveGeneration();
    assert.equal(refused.allowed, false);
    assert.equal(refused.budget.used, 1, "il rifiuto ha consumato il gettone che non ha usato");
    assert.equal(refused.budget.remaining, 0);

    assert.equal((await currentBudget()).used, 1, "il contatore è salito oltre il tetto a causa di un rifiuto");
  } finally {
    Date.now = realNow;
  }
});

test("a retried request reuses the image the first attempt produced", () => {
  forgetAllRequests();

  assert.deepEqual(claimRequest("req-abcdefgh"), { mode: "run" });

  const image = { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" };
  completeRequest("req-abcdefgh", image);

  const retry = claimRequest("req-abcdefgh");
  assert.equal(retry.mode, "reuse");
  assert.deepEqual([...retry.image.bytes], [1, 2, 3], "il retry deve ricevere l'immagine già prodotta");
  assert.equal(retry.image.mimeType, "image/png");
});

test("an attempt still running answers busy instead of starting a second one", () => {
  forgetAllRequests();

  claimRequest("req-running-1");
  const again = claimRequest("req-running-1");

  assert.equal(again.mode, "busy", "il retry ha avviato una seconda generazione");
  assert.ok(again.retryAfterSeconds > 0);
});

test("a failed attempt frees its id so the retry can run", () => {
  forgetAllRequests();

  claimRequest("req-failed-01");
  failRequest("req-failed-01");

  assert.deepEqual(claimRequest("req-failed-01"), { mode: "run" });
});

test("an attempt that never reported back stops blocking after the lease", () => {
  forgetAllRequests();

  const realNow = Date.now;
  try {
    Date.now = () => Date.parse("2026-06-01T10:00:00.000Z");
    claimRequest("req-orphan-01");
    assert.equal(claimRequest("req-orphan-01").mode, "busy");

    /* Funzione uccisa a metà: il gettone non torna, ma l'id non deve restare occupato per sempre. */
    Date.now = () => Date.parse("2026-06-01T10:11:00.000Z");
    assert.deepEqual(claimRequest("req-orphan-01"), { mode: "run" });
  } finally {
    Date.now = realNow;
  }
});

test("ignores a request id the client had no business sending", () => {
  const withId = (value) =>
    requestIdFrom(new Request("https://press.test/api/bwslab/edit", { headers: { "X-Stencil-Request-Id": value } }));

  assert.equal(withId("req-abcdefgh"), "req-abcdefgh");
  assert.equal(withId("short"), null);
  assert.equal(withId("con spazi e a capo"), null);
  assert.equal(withId("x".repeat(129)), null);
  assert.equal(requestIdFrom(new Request("https://press.test/api/bwslab/edit")), null);
});

/**
 * Un Redis finto per i test: tiene i contatori in una Map ed esegue le stesse
 * istruzioni che manda il client. EVAL applica controllo e incremento in un
 * colpo solo, come fa lo script Lua sul server vero; la scadenza dei tasti non
 * serve qui perché i test spostano l'orologio e cambiano giorno.
 */
function fakeRedis() {
  const counts = new Map();
  const commands = [];
  const realFetch = globalThis.fetch;

  globalThis.fetch = async (_url, init) => {
    const command = JSON.parse(init.body);
    const name = command[0];
    const key = name === "EVAL" ? command[3] : command[1];
    commands.push([name, key]);

    let result = null;

    if (name === "EVAL") {
      const cap = Number(command[4]);
      const used = counts.get(key) ?? 0;

      if (used >= cap) {
        result = [0, used];
      } else {
        const taken = used + 1;
        counts.set(key, taken);
        result = [1, taken];
      }
    } else if (name === "GET") {
      result = counts.get(key) ?? null;
    } else if (name === "DECR") {
      const next = (counts.get(key) ?? 0) - 1;
      counts.set(key, next);
      result = next;
    } else if (name === "SET") {
      counts.set(key, Number(command[2]));
      result = "OK";
    } else if (name === "PEXPIRE") {
      result = 1;
    }

    return new Response(JSON.stringify({ result }), { status: 200 });
  };

  return {
    counts,
    commands,
    restore() {
      globalThis.fetch = realFetch;
    },
  };
}

test("admits simultaneous shared requests atomically instead of overshooting", async () => {
  const redis = fakeRedis();
  const realNow = Date.now;
  const savedEnv = {
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  };

  Date.now = () => Date.parse("2026-07-04T09:00:00.000Z");
  process.env.KV_REST_API_URL = "https://kv.stub.local";
  process.env.KV_REST_API_TOKEN = "token-di-prova";

  try {
    /* Due richieste partono insieme e il tetto è uno: una sola può passare. */
    const [first, second] = await Promise.all([reserveGeneration(), reserveGeneration()]);

    assert.equal(
      [first, second].filter((reservation) => reservation.allowed).length,
      1,
      "entrambe le richieste hanno preso l'unico gettone",
    );
    assert.equal([first, second].filter((reservation) => !reservation.allowed).length, 1);
    assert.equal((await currentBudget()).used, 1, "il contatore condiviso è salito sopra il tetto");

    /* Con lo script il rifiuto non scrive: non ci deve essere nessun rollback. */
    assert.ok(
      redis.commands.some(([name]) => name === "EVAL"),
      "l'ammissione non passa dallo script Lua",
    );
    assert.equal(
      redis.commands.filter(([name]) => name === "DECR").length,
      0,
      "il rifiuto ha rimediato con un rollback invece di un controllo atomico",
    );
  } finally {
    redis.restore();
    Date.now = realNow;

    if (savedEnv.url === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = savedEnv.url;

    if (savedEnv.token === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = savedEnv.token;
  }
});
