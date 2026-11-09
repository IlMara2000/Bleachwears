import assert from "node:assert/strict";
import test from "node:test";
import { findImagePayload, nearestAspectRatio, STENCIL_PROMPT } from "../lib/stencil/provider.ts";
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
