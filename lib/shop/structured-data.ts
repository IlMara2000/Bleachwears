import type { Product } from "./catalog.ts";
import { SELLER } from "./business.ts";
import { SITE_URL, absoluteUrl } from "../seo.ts";

/**
 * Il catalogo dichiarato a Google, ricavato dai dati che il checkout usa per
 * calcolare i prezzi: se un prezzo cambia nel catalogo, cambia anche qui.
 *
 * Le disponibilità sono quelle vere. I capi dipinti a mano si producono dopo
 * l'ordine (`MadeToOrder`), le serie limitate non sono infinite e i pezzi unici
 * già pronti sono `InStock`: dichiarare tutto "disponibile" sarebbe una bugia
 * che Google può verificare.
 */
const AVAILABILITY = {
  inStock: "https://schema.org/InStock",
  limited: "https://schema.org/LimitedAvailability",
  madeToOrder: "https://schema.org/MadeToOrder",
} as const;

export function availabilityOf(product: Pick<Product, "status">): string {
  const status = product.status.toLowerCase();

  if (status.includes("disponibile")) return AVAILABILITY.inStock;
  if (status.includes("limitata")) return AVAILABILITY.limited;

  return AVAILABILITY.madeToOrder;
}

/**
 * La scheda prodotto ha un URL leggibile ricavato dal nome: `serpenti`, non
 * `BW-T01`. Serve a Google per associare un'offerta a una pagina, e a chi
 * riceve il link per capire dove sta andando.
 */
export function productSlug(product: Pick<Product, "name">): string {
  return product.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function productPath(product: Pick<Product, "name">): string {
  return `/prodotti/${productSlug(product)}`;
}

/** La scheda di un singolo capo: stessa fonte di prezzo del catalogo e del checkout. */
export function productStructuredData(product: Product) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${absoluteUrl(productPath(product))}#product`,
    name: `${product.name} — ${product.kind}`,
    sku: product.id,
    category: product.category,
    description: [product.kind, product.technique, product.status].filter(Boolean).join(" · "),
    brand: { "@type": "Brand", name: SELLER.brand },
    ...(product.image ? { image: [absoluteUrl(product.image)] } : {}),
    offers: {
      "@type": "Offer",
      price: product.price,
      priceCurrency: "EUR",
      availability: availabilityOf(product),
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: SELLER.brand },
      url: absoluteUrl(productPath(product)),
    },
  };
}

export function catalogStructuredData(products: Product[]) {
  const organizationId = `${SITE_URL}/#organization`;
  const websiteId = `${SITE_URL}/#website`;
  const catalogId = `${SITE_URL}/#catalogo`;
  const home = `${SITE_URL}/`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: SELLER.brand,
        url: home,
        logo: absoluteUrl("/icon-192.png"),
        sameAs: [SELLER.instagram],
      },
      {
        "@type": "WebSite",
        "@id": websiteId,
        url: home,
        name: SELLER.brand,
        inLanguage: "it-IT",
        publisher: { "@id": organizationId },
      },
      {
        "@type": "ItemList",
        "@id": catalogId,
        name: `Catalogo ${SELLER.brand}`,
        numberOfItems: products.length,
        itemListElement: products.map((product, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "Product",
            "@id": `${absoluteUrl(productPath(product))}#product`,
            name: `${product.name} — ${product.kind}`,
            sku: product.id,
            category: product.category,
            description: [product.kind, product.technique, product.status].filter(Boolean).join(" · "),
            brand: { "@type": "Brand", name: SELLER.brand },
            ...(product.image ? { image: [absoluteUrl(product.image)] } : {}),
            offers: {
              "@type": "Offer",
              price: product.price,
              priceCurrency: "EUR",
              availability: availabilityOf(product),
              itemCondition: "https://schema.org/NewCondition",
              seller: { "@id": organizationId },
              url: absoluteUrl(productPath(product)),
            },
          },
        })),
      },
    ],
  };
}
