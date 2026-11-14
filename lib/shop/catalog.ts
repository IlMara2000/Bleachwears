export type ProductCategory = "tee" | "hoodie" | "oneoff";
export type GarmentType = "tee" | "hoodie";
export type Placement = "front" | "back";
export type PrintScale = "S" | "M" | "L";
export type ProductArt = "patchwork" | "ribbon" | "index" | "seam" | "frame" | "sample";

export type Product = {
  id: string;
  name: string;
  category: ProductCategory;
  kind: string;
  price: number;
  status: string;
  color: string;
  reaction: string;
  art: ProductArt;
  image?: string;
  technique?: string;
};

export const CLOTHING_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;

export type ClothingSize = (typeof CLOTHING_SIZES)[number];

/**
 * Catalogo di riferimento. Il checkout ricalcola sempre i prezzi da qui:
 * il browser non può proporre un importo diverso da quello pubblicato.
 */
export const fallbackProducts: Product[] = [
  {
    id: "BW-T01",
    name: "Serpenti",
    category: "tee",
    kind: "T-shirt 240 g",
    price: 49,
    status: "7–10 giorni",
    color: "#171717",
    reaction: "#d88954",
    art: "patchwork",
    image: "/feed/drago-tee.jpg",
    technique: "Acrilico a mano",
  },
  {
    id: "BW-T02",
    name: "Ragno",
    category: "tee",
    kind: "T-shirt 240 g",
    price: 55,
    status: "7–10 giorni",
    color: "#4d1d29",
    reaction: "#e8aa83",
    art: "ribbon",
    image: "/feed/spiderman.jpg",
    technique: "Acrilico a mano",
  },
  {
    id: "BW-T03",
    name: "Circus",
    category: "tee",
    kind: "T-shirt oversize",
    price: 59,
    status: "Serie limitata",
    color: "#17223c",
    reaction: "#cfa361",
    art: "index",
    image: "/feed/santeria.jpg",
    technique: "Acrilico a mano",
  },
  {
    id: "BW-H01",
    name: "Drago",
    category: "hoodie",
    kind: "Felpa 400 g",
    price: 89,
    status: "10–14 giorni",
    color: "#151515",
    reaction: "#e2c090",
    art: "seam",
    image: "/feed/drago-hoodie.jpg",
    technique: "Acrilico a mano",
  },
  {
    id: "BW-H02",
    name: "Moto Evo",
    category: "hoodie",
    kind: "Felpa 400 g",
    price: 99,
    status: "Serie limitata",
    color: "#352018",
    reaction: "#d78a56",
    art: "frame",
    image: "/feed/moto.jpg",
    technique: "Acrilico a mano",
  },
  {
    id: "BW-O01",
    name: "Ali",
    category: "oneoff",
    kind: "Pezzo unico",
    price: 119,
    status: "1 disponibile",
    color: "#22201f",
    reaction: "#c5bbff",
    art: "sample",
    image: "/feed/reel-aquila.jpg",
    technique: "Acrilico a mano",
  },
];

/* Prezzi dei lavori su misura, calcolati sul server come nel Custom Lab. */
export const CUSTOM_BASE = { "custom-tee": 49, "custom-hoodie": 89 } as const;
export const CUSTOM_FILE_FEE = 10;
export const CUSTOM_BACK_FEE = 8;
/* Mini game acrilico: base 49 € più un euro per goccia. */
export const DROP_BASE = 49;
export const DROP_MAX = 60;

export type CustomSku = keyof typeof CUSTOM_BASE;

export type OrderLineInput = {
  sku: string;
  size?: string;
  quantity?: number;
  options?: { custom?: boolean; back?: boolean; drops?: number };
};

export type PricedLine = {
  sku: string;
  name: string;
  detail: string;
  size?: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

const catalogById = new Map(fallbackProducts.map((product) => [product.id, product]));

export function getCatalogProduct(id: string) {
  return catalogById.get(id);
}

export function isClothingSize(value: unknown): value is ClothingSize {
  return typeof value === "string" && (CLOTHING_SIZES as readonly string[]).includes(value);
}

export function priceLine(input: OrderLineInput): PricedLine | null {
  const quantity = Math.min(10, Math.max(1, Math.round(Number(input.quantity) || 1)));
  const product = getCatalogProduct(input.sku);

  if (product) {
    return {
      sku: product.id,
      name: product.name,
      detail: `${product.kind} · ${product.technique ?? "Fatto a mano"}`,
      size: isClothingSize(input.size) ? input.size : undefined,
      quantity,
      unitPrice: product.price,
      total: product.price * quantity,
    };
  }

  if (input.sku in CUSTOM_BASE) {
    const base = CUSTOM_BASE[input.sku as CustomSku];
    const art = base + (input.options?.custom ? CUSTOM_FILE_FEE : 0) + (input.options?.back ? CUSTOM_BACK_FEE : 0);
    return {
      sku: input.sku,
      name: "Custom Reaction",
      detail: `${input.sku === "custom-hoodie" ? "Felpa 400 g" : "T-shirt 240 g"} · pezzo su misura`,
      size: isClothingSize(input.size) ? input.size : undefined,
      quantity,
      unitPrice: art,
      total: art * quantity,
    };
  }

  if (input.sku === "acrylic-drops") {
    const drops = Math.min(DROP_MAX - DROP_BASE, Math.max(1, Math.round(Number(input.options?.drops) || 0)));
    const total = DROP_BASE + drops;
    return {
      sku: "acrylic-drops",
      name: "Pezzo acrilico",
      detail: `Acrilico a mano · ${drops} gocce`,
      quantity: 1,
      unitPrice: total,
      total,
    };
  }

  return null;
}

export type ShippingMethodId = "standard" | "express" | "pickup";

export type ShippingMethod = {
  id: ShippingMethodId;
  label: string;
  eta: string;
  price: number;
  note: string;
};

/* Tariffe modificabili in un punto solo: il checkout le usa client e server. */
export const SHIPPING_METHODS: ShippingMethod[] = [
  {
    id: "standard",
    label: "Posta tracciata",
    eta: "3–5 giorni lavorativi",
    price: 6,
    note: "Consegna in tutta Italia, codice di tracciamento via email.",
  },
  {
    id: "express",
    label: "Corriere espresso",
    eta: "1–2 giorni lavorativi",
    price: 12,
    note: "Ritiro dal laboratorio il giorno lavorativo successivo.",
  },
  {
    id: "pickup",
    label: "Ritiro a mano",
    eta: "Su appuntamento",
    price: 0,
    note: "Concordiamo luogo e orario quando il capo è pronto.",
  },
];

export const FREE_SHIPPING_FROM = 120;

export function getShippingMethod(id: string): ShippingMethod {
  return SHIPPING_METHODS.find((method) => method.id === id) ?? SHIPPING_METHODS[0];
}

export function shippingCost(id: string, subtotal: number) {
  const method = getShippingMethod(id);
  if (method.price === 0) return 0;
  if (subtotal >= FREE_SHIPPING_FROM) return 0;
  return method.price;
}

/**
 * Euro mancanti alla spedizione gratuita; 0 quando la soglia è già raggiunta.
 * Mai negativo: un carrello con totale non numerico non può scollare la soglia.
 */
export function freeShippingGap(subtotal: number) {
  return Math.max(0, FREE_SHIPPING_FROM - Math.max(0, subtotal));
}

export function computeTotals(lines: PricedLine[], shippingId: string) {
  const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
  const shipping = shippingCost(shippingId, subtotal);
  return { subtotal, shipping, total: subtotal + shipping };
}

export function money(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function orderReference(date = new Date()) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let index = 0; index < 4; index += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `BW-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}-${suffix}`;
}
