import assert from "node:assert/strict";
import test from "node:test";

import { MAX_INTENT_CHARS, compileEditPrompt } from "../lib/stencil/prompt.ts";

test("keeps what the user asked, verbatim, in every provider brief", () => {
  const intent = "rendi il cielo rosso e aggiungi un sole";

  for (const provider of ["local", "gemini", "cloudflare"]) {
    const { text, intent: kept } = compileEditPrompt(intent, provider);
    assert.equal(kept, intent);
    assert.match(text, /rendi il cielo rosso e aggiungi un sole/);
  }
});

test("a brief never lets the instruction blend into the next clause", () => {
  const { text } = compileEditPrompt("rendi il cielo rosso", "local");

  assert.match(text, /Edit the input image: rendi il cielo rosso\./);
});

test("punctuation already typed is not doubled", () => {
  const { text } = compileEditPrompt("rendi il cielo rosso.", "cloudflare");

  assert.match(text, /rendi il cielo rosso\./);
  assert.doesNotMatch(text, /rosso\.\./);
});

test("quotes in the instruction cannot open or close the brief", () => {
  const { text } = compileEditPrompt('scrivi "ciao" sulla maglietta', "gemini");

  assert.doesNotMatch(text, /"ciao"/);
  assert.match(text, /'ciao'/);
});

test("every provider keeps the invariants that protect the rest of the image", () => {
  for (const provider of ["local", "gemini", "cloudflare"]) {
    const { text } = compileEditPrompt("metti una giacca di pelle", provider);

    assert.match(text, /identity|face/i);
    assert.match(text, /framing|aspect ratio/i);
    assert.match(text, /text|watermark/i);
  }
});

test("each provider gets a different shape, not the same string", () => {
  const local = compileEditPrompt("metti una giacca di pelle", "local").text;
  const gemini = compileEditPrompt("metti una giacca di pelle", "gemini").text;
  const cloudflare = compileEditPrompt("metti una giacca di pelle", "cloudflare").text;

  assert.notEqual(local, gemini);
  assert.notEqual(gemini, cloudflare);
  /* Gemini can take structure; FLUX must stay short. */
  assert.match(gemini, /\n- /);
  assert.ok(cloudflare.length < gemini.length);
});

test("whitespace and control characters are normalised, nothing else is rewritten", () => {
  const { text, intent } = compileEditPrompt("  rendi   il\ncielo\u0007 rosso  ", "local");

  assert.equal(intent, "rendi il cielo rosso");
  assert.match(text, /rendi il cielo rosso\./);
});

test("the instruction is clamped to the route's own limit", () => {
  const long = "a".repeat(MAX_INTENT_CHARS + 200);
  const { intent } = compileEditPrompt(long, "gemini");

  assert.equal(intent.length, MAX_INTENT_CHARS);
});

test("an empty instruction compiles to nothing instead of a silent default", () => {
  assert.deepEqual(compileEditPrompt("   ", "local"), { text: "", intent: "" });
});
