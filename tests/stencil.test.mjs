import assert from "node:assert/strict";
import test from "node:test";
import { findImagePayload, nearestAspectRatio, readCloudflareImage, STENCIL_PROMPT } from "../lib/stencil/provider.ts";
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

  const out = stylize(rgba, coverage, width, height, { hatch: false });
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
