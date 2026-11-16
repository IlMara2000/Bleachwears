import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fallbackProducts, purchasableProducts } from "../lib/shop/catalog.ts";

const root = new URL("../", import.meta.url);

const extra = {
  id: "BW-Z99",
  name: "Capo senza prezzo",
  category: "tee",
  kind: "T-shirt 240 g",
  price: 0,
  status: "7–10 giorni",
  color: "#000000",
  reaction: "#ffffff",
  art: "patchwork",
};

test("offers only what the checkout can price", () => {
  const { sellable, unbuyable } = purchasableProducts([...fallbackProducts, extra]);

  assert.equal(sellable.length, fallbackProducts.length);
  assert.deepEqual(
    sellable.map((product) => product.id),
    fallbackProducts.map((product) => product.id),
  );
  assert.deepEqual(unbuyable, ["BW-Z99"], "un capo senza prezzo di listino non è stato segnalato");
});

test("keeps the order the database gave, so the shop does not reshuffle itself", () => {
  const reversed = [...fallbackProducts].reverse();
  const { sellable } = purchasableProducts(reversed);

  assert.deepEqual(
    sellable.map((product) => product.id),
    reversed.map((product) => product.id),
  );
});

test("does not touch the rows it is given", () => {
  const input = [extra, ...fallbackProducts];
  const snapshot = input.map((product) => product.id);

  purchasableProducts(input);

  assert.deepEqual(input.map((product) => product.id), snapshot);
});

test("a catalog where nothing matches leaves the reference catalog in place", async () => {
  assert.deepEqual(purchasableProducts([extra]).sellable, []);

  const app = await readFile(new URL("app/BleachwearsApp.tsx", root), "utf8");

  assert.match(app, /purchasableProducts\(data\.map\(productFromRow\)\)/, "la home mostra i capi senza filtrarli");
  assert.match(app, /sellable\.length > 0 \? sellable : fallbackProducts/, "un database di soli id sconosciuti svuoterebbe il negozio");
  assert.match(app, /catalog\.unpriced/, "un capo escluso non lascia traccia nel log");
});
