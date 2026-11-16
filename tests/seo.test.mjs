import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import robots from "../app/robots.ts";
import sitemap from "../app/sitemap.ts";
import { SITE_URL } from "../lib/seo.ts";
import { fallbackProducts } from "../lib/shop/catalog.ts";
import { availabilityOf, catalogStructuredData } from "../lib/shop/structured-data.ts";

const root = new URL("../", import.meta.url);

test("declares every catalog product with its real price and availability", () => {
  const data = catalogStructuredData(fallbackProducts);
  const list = data["@graph"].find((node) => node["@type"] === "ItemList");

  assert.ok(list, "manca la lista del catalogo");
  assert.equal(list.numberOfItems, fallbackProducts.length);
  assert.equal(list.itemListElement.length, fallbackProducts.length);

  for (const [index, entry] of list.itemListElement.entries()) {
    const product = fallbackProducts[index];

    assert.equal(entry.position, index + 1, "le posizioni della lista devono partire da uno");
    assert.equal(entry.item.sku, product.id);
    assert.equal(entry.item.offers.price, product.price, `${product.id}: prezzo diverso dal catalogo`);
    assert.equal(entry.item.offers.priceCurrency, "EUR");
    assert.match(entry.item.offers.availability, /^https:\/\/schema\.org\/[A-Za-z]+$/);
    assert.equal(entry.item.image.length, 1);
    assert.match(entry.item.image[0], /^https:\/\/.+\.jpg$/, `${product.id}: immagine non assoluta`);
  }
});

test("maps the catalog status to the availability a crawler understands", () => {
  const sample = fallbackProducts[0];

  assert.equal(availabilityOf({ ...sample, status: "1 disponibile" }), "https://schema.org/InStock");
  assert.equal(availabilityOf({ ...sample, status: "Serie limitata" }), "https://schema.org/LimitedAvailability");
  assert.equal(availabilityOf({ ...sample, status: "7–10 giorni" }), "https://schema.org/MadeToOrder");

  /* Ogni prodotto del catalogo reale deve finire in una di queste tre categorie. */
  for (const product of fallbackProducts) {
    assert.match(availabilityOf(product), /schema\.org\/(InStock|LimitedAvailability|MadeToOrder)$/);
  }
});

test("lists every public page once and points robots at the sitemap", () => {
  const urls = sitemap().map((entry) => entry.url);
  const expected = [
    "/",
    "/bwslab",
    "/bwslab/nfsw",
    "/legale/privacy",
    "/legale/spedizioni-e-resi",
    "/legale/termini",
  ].map((path) => `${SITE_URL}${path}`);

  assert.deepEqual([...urls].sort(), [...expected].sort());
  assert.equal(new Set(urls).size, urls.length, "la sitemap contiene URL duplicati");

  const rules = robots();
  assert.equal(rules.sitemap, `${SITE_URL}/sitemap.xml`);
  assert.deepEqual(rules.rules[0].allow, "/");
  assert.deepEqual(rules.rules[0].disallow, ["/api/"]);
});

test("the home page ships the structured data into the HTML", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");

  assert.match(page, /application\/ld\+json/, "la home non dichiara il JSON-LD");
  assert.match(page, /catalogStructuredData\(fallbackProducts\)/, "i dati non vengono dal catalogo");
  /* Un `<` non escapato dentro un nome prodotto chiuderebbe il tag. */
  assert.match(page, /replace\(\/<\/g, "\\\\u003c"\)/, "il JSON non è protetto dalla chiusura del tag");
});
