"use client";

import Image from "next/image";
import type { ChangeEvent, CSSProperties, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ProductRow } from "@/lib/supabase/database.types";

type View = "links" | "shop" | "lab";
type ProductCategory = "tee" | "hoodie" | "oneoff";
type GarmentType = "tee" | "hoodie";
type Placement = "front" | "back";
type PrintScale = "S" | "M" | "L";
type CatalogSource = "local" | "live";
type ProductArt = "patchwork" | "ribbon" | "index" | "seam" | "frame" | "sample";

type Product = {
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
};

type CartItem = {
  id: string;
  name: string;
  detail: string;
  price: number;
};

const fallbackProducts: Product[] = [
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
  },
];

const garmentColors = [
  { id: "black", name: "Nero carbone", hex: "#171717" },
  { id: "burgundy", name: "Bordeaux", hex: "#531f2a" },
  { id: "navy", name: "Blu notte", hex: "#17243f" },
  { id: "forest", name: "Verde bosco", hex: "#213529" },
  { id: "cocoa", name: "Cacao", hex: "#3b261e" },
];

const reactionMap = {
  black: [
    { id: "rust", name: "Ruggine", hex: "#d47e47" },
    { id: "bone", name: "Osso", hex: "#e8d4ab" },
  ],
  burgundy: [
    { id: "peach", name: "Pesca", hex: "#efa17d" },
    { id: "rose", name: "Rosa polvere", hex: "#d8878c" },
  ],
  navy: [
    { id: "gold", name: "Oro morbido", hex: "#d0a35d" },
    { id: "ice", name: "Ghiaccio", hex: "#bac5c0" },
  ],
  forest: [
    { id: "sun", name: "Sabbia chiara", hex: "#d5b169" },
    { id: "moss", name: "Muschio", hex: "#a9a56c" },
  ],
  cocoa: [
    { id: "sand", name: "Sabbia", hex: "#c79b71" },
    { id: "amber", name: "Ambra", hex: "#d2753c" },
  ],
} as const;

const designs = [
  { id: "patchwork", name: "Modulo 01", note: "Tasselli morbidi", symbol: "▦" },
  { id: "ribbon", name: "Nastro 02", note: "Percorso continuo", symbol: "⌁" },
  { id: "index", name: "Indice 03", note: "Segmenti liberi", symbol: "╱" },
  { id: "frame", name: "Finestra 04", note: "Campo aperto", symbol: "▰" },
] as const;

const navItems: { id: View; label: string; short: string }[] = [
  { id: "links", label: "Home", short: "Home" },
  { id: "shop", label: "Drop", short: "Drop" },
  { id: "lab", label: "Custom Lab", short: "Lab" },
];

const INSTAGRAM_PROFILE = "https://www.instagram.com/bleach_wears/";
const TIKTOK_PROFILE = "https://www.tiktok.com/@bleach_wears";

const instagramPosts = [
  {
    kind: "Post",
    date: "Lug 2026",
    title: "Felpa motocicletta",
    caption: "Harley Evo 1340: motore, telaio e strada dipinti a mano su felpa nera.",
    image: "/feed/moto.jpg",
    url: "https://www.instagram.com/bleach_wears/p/Daih1UgjMPw/",
  },
  {
    kind: "Post",
    date: "Set 2026",
    title: "Maglietta ragno",
    caption: "Ragno bianco su ragnatela rossa: acrilico a mano su cotone nero.",
    image: "/feed/spiderman.jpg",
    url: "https://www.instagram.com/bleach_wears/p/DdYUsEQDI0E/",
  },
  {
    kind: "Post",
    date: "Set 2026",
    title: "Maglietta serpenti",
    caption: "Due serpenti intrecciati tra fiori rossi: pennellata dopo pennellata.",
    image: "/feed/drago-tee.jpg",
    url: "https://www.instagram.com/bleach_wears/p/Dd1o1ZSjOXK/",
  },
  {
    kind: "Post",
    date: "Ott 2026",
    title: "Felpa drago",
    caption: "Draghi grigi su felpa blu notte: lo stesso tema, ogni volta un altro capo.",
    image: "/feed/drago-hoodie.jpg",
    url: "https://www.instagram.com/bleach_wears/p/DeYkRbJjH9i/",
  },
  {
    kind: "Post",
    date: "Ott 2025",
    title: "Maglietta Circus",
    caption: "Tendone, elefante e lettering: acrilico su cotone nero.",
    image: "/feed/santeria.jpg",
    url: "https://www.instagram.com/bleach_wears/p/DPbv5fwjPvo/",
  },
];

const instagramReels = [
  {
    code: "De94I9YBFPi",
    kind: "Reel",
    date: "Ott 2026",
    title: "Ali e pugnale",
    caption: "Ali e pugnale sul retro di una felpa: l’ultimo video uscito.",
    image: "/feed/reel-aquila.jpg",
  },
  {
    code: "DRz4LmWDK2J",
    kind: "Reel",
    date: "Dic 2025",
    title: "Dal set di dicembre",
    caption: "Il video uscito insieme al post del 3 dicembre 2025.",
    image: "/reels/reel-dicembre-poster.jpg",
    video: "/reels/reel-dicembre.mp4",
  },
];

const CART_HISTORY_KEY = "bleachwearsCart";

function money(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function readableName(name: string) {
  if (name !== name.toUpperCase()) return name;
  return name
    .toLocaleLowerCase("it-IT")
    .replace(/(^|[\s/])([a-zà-ÿ])/g, (_, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase("it-IT")}`);
}

function productFromRow(row: ProductRow): Product {
  return {
    id: row.id,
    name: readableName(row.name),
    category: row.category,
    kind: row.kind,
    price: row.price_cents / 100,
    status: row.status,
    color: row.color,
    reaction: row.reaction,
    art: row.art,
  };
}

export function BleachwearsApp() {
  const [view, setView] = useState<View>("links");
  const [shopFilter, setShopFilter] = useState<"all" | ProductCategory>("all");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [catalogProducts, setCatalogProducts] = useState<Product[]>(fallbackProducts);
  const [catalogSource, setCatalogSource] = useState<CatalogSource>("local");

  const [labStep, setLabStep] = useState(1);
  const [garment, setGarment] = useState<GarmentType>("tee");
  const [garmentColor, setGarmentColor] = useState("black");
  const [garmentSize, setGarmentSize] = useState("M");
  const [design, setDesign] = useState("patchwork");
  const [reaction, setReaction] = useState("rust");
  const [placement, setPlacement] = useState<Placement>("front");
  const [printScale, setPrintScale] = useState<PrintScale>("M");
  const [customFileName, setCustomFileName] = useState("");
  const [customPreview, setCustomPreview] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const cartSequence = useRef(0);
  const mainRef = useRef<HTMLElement>(null);
  const pageLayerRef = useRef<HTMLDivElement>(null);
  const cartSheetRef = useRef<HTMLElement>(null);
  const cartCloseButtonRef = useRef<HTMLButtonElement>(null);
  const cartTriggerRef = useRef<HTMLElement | null>(null);
  const builderCardRef = useRef<HTMLElement>(null);
  const builderHeadingRef = useRef<HTMLHeadingElement>(null);

  const closeCart = useCallback(() => {
    if (window.history.state?.[CART_HISTORY_KEY]) {
      window.history.back();
      return;
    }
    setCartOpen(false);
  }, []);

  useEffect(() => {
    const syncFromLocation = () => {
      const hash = window.location.hash.replace("#", "");
      const matchingView = navItems.find((item) => item.id === hash);
      setView(matchingView?.id ?? "links");
      setCartOpen(Boolean(window.history.state?.[CART_HISTORY_KEY]));
    };

    syncFromLocation();
    window.addEventListener("hashchange", syncFromLocation);
    window.addEventListener("popstate", syncFromLocation);
    return () => {
      window.removeEventListener("hashchange", syncFromLocation);
      window.removeEventListener("popstate", syncFromLocation);
    };
  }, []);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SUPABASE_CATALOG_ENABLED !== "true") return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let cancelled = false;
    void supabase
      .from("products")
      .select("id, slug, name, category, kind, price_cents, status, color, reaction, art, active, position, created_at, updated_at")
      .eq("active", true)
      .order("position", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setCatalogProducts(data.map(productFromRow));
        setCatalogSource("live");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    return () => {
      if (customPreview) URL.revokeObjectURL(customPreview);
    };
  }, [customPreview]);

  useEffect(() => {
    if (!cartOpen) return;

    const pageLayer = pageLayerRef.current;
    const cartSheet = cartSheetRef.current;
    const scrollY = window.scrollY;
    const previousOverflow = document.body.style.overflow;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;
    pageLayer?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeCart();
        return;
      }

      if (event.key !== "Tab" || !cartSheet) return;
      const focusable = Array.from(
        cartSheet.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!cartSheet.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => cartCloseButtonRef.current?.focus());

    return () => {
      pageLayer?.removeAttribute("inert");
      document.body.style.overflow = previousOverflow;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      window.removeEventListener("keydown", handleKeyDown);
      window.scrollTo({ top: scrollY, behavior: "auto" });
      window.requestAnimationFrame(() => cartTriggerRef.current?.focus());
    };
  }, [cartOpen, closeCart]);

  const activeColor = garmentColors.find((color) => color.id === garmentColor) || garmentColors[0];
  const availableReactions = reactionMap[garmentColor as keyof typeof reactionMap];
  const activeReaction = availableReactions.find((option) => option.id === reaction) || availableReactions[0];
  const labPrice = (garment === "tee" ? 49 : 89) + (design === "custom" ? 10 : 0) + (placement === "back" ? 8 : 0);

  const filteredProducts = useMemo(
    () =>
      shopFilter === "all"
        ? catalogProducts
        : catalogProducts.filter((product) => product.category === shopFilter),
    [catalogProducts, shopFilter],
  );

  function navigate(next: View) {
    setView(next);
    if (window.location.hash !== `#${next}`) window.history.pushState(null, "", `#${next}`);
    window.requestAnimationFrame(() => {
      mainRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function openCart() {
    cartTriggerRef.current = document.activeElement as HTMLElement | null;
    if (!window.history.state?.[CART_HISTORY_KEY]) {
      const currentState = window.history.state && typeof window.history.state === "object"
        ? window.history.state
        : {};
      window.history.pushState({ ...currentState, [CART_HISTORY_KEY]: true }, "", window.location.href);
    }
    setCartOpen(true);
  }

  function closeCartAndNavigate(next: View) {
    if (window.history.state?.[CART_HISTORY_KEY]) {
      window.addEventListener("popstate", () => navigate(next), { once: true });
      window.history.back();
      return;
    }
    setCartOpen(false);
    navigate(next);
  }

  function goToLabStep(next: number) {
    setLabStep(Math.max(1, Math.min(4, next)));
    window.requestAnimationFrame(() => {
      builderHeadingRef.current?.focus({ preventScroll: true });
      if (window.matchMedia("(max-width: 680px)").matches) {
        builderCardRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    });
  }

  function addToCart(name: string, detail: string, price: number) {
    cartSequence.current += 1;
    setCartItems((current) => [
      ...current,
      { id: `cart-${cartSequence.current}`, name, detail, price },
    ]);
    setToast(`${name} è nel carrello`);
  }

  function updateSelection<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setConfirmed(false);
  }

  function selectGarmentColor(colorId: string) {
    setGarmentColor(colorId);
    setReaction(reactionMap[colorId as keyof typeof reactionMap][0].id);
    setConfirmed(false);
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif", "application/pdf"]);
    const isImageExtension = /\.(png|jpe?g|webp|heic|heif)$/i.test(file.name);
    const allowedExtension = isImageExtension || /\.pdf$/i.test(file.name);
    if ((file.type && !allowedTypes.has(file.type)) || (!file.type && !allowedExtension)) {
      setToast("Formato non supportato: usa JPG, PNG, WEBP, HEIC o PDF");
      event.target.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setToast("Il file supera il limite di 10 MB");
      event.target.value = "";
      return;
    }

    setCustomFileName(file.name);
    setDesign("custom");
    setConfirmed(false);
    setCustomPreview(file.type.startsWith("image/") || isImageExtension ? URL.createObjectURL(file) : "");
    setToast("Grafica caricata per l’anteprima");
    event.target.value = "";
  }

  const previewStyle = {
    "--garment-color": activeColor.hex,
    "--reaction-color": activeReaction.hex,
  } as CSSProperties;

  return (
    <div className="site-root">
      <div className="page-layer" ref={pageLayerRef}>
        <a
          className="skip-link"
          href="#main-content"
          onClick={(event) => {
            event.preventDefault();
            mainRef.current?.focus({ preventScroll: true });
            mainRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
          }}
        >
          Vai al contenuto
        </a>
        <header className="topbar">
          <button className="brand-button" type="button" onClick={() => navigate("links")} aria-label="Bleachwears, vai alla home">
            <GridMark />
            <span>bleachwears</span>
          </button>

          <nav className="primary-nav" aria-label="Navigazione principale">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={view === item.id ? "is-current" : ""}
                onClick={() => navigate(item.id)}
                aria-current={view === item.id ? "page" : undefined}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <button className="bag-button" type="button" onClick={openCart} aria-label={`Apri carrello, ${cartItems.length} articoli`}>
            <span>Carrello</span>
            <b>{cartItems.length}</b>
          </button>
        </header>

        <div className="ticker-strip" aria-hidden="true">
          <div className="ticker-track">
            {[0, 1].map((group) => (
              <span className="ticker-group" key={group}>
                <b>bleachwears</b>
                <i>candeggina su cotone</i>
                <b>un pezzo alla volta</b>
                <i>nessun reprint</i>
                <b>fatto a mano · italia</b>
                <i>drop 01 / 2026</i>
              </span>
            ))}
          </div>
        </div>

        <nav className="mobile-dock" aria-label="Navigazione mobile">
          {navItems.map((item) => (
            <button key={item.id} type="button" className={view === item.id ? "is-current" : ""} onClick={() => navigate(item.id)} aria-current={view === item.id ? "page" : undefined}>
              <span aria-hidden="true">{item.id === "links" ? "⌂" : item.id === "shop" ? "◫" : "＋"}</span>{item.short}
            </button>
          ))}
          <button type="button" onClick={openCart} aria-label={`Apri carrello, ${cartItems.length} articoli`}><span aria-hidden="true">{cartItems.length}</span>Bag</button>
        </nav>

        <main id="main-content" className="site-main" ref={mainRef} tabIndex={-1}>
          {view === "links" && (
            <BentoHome
              navigate={navigate}
              notify={setToast}
              products={catalogProducts.slice(0, 3)}
              catalogSource={catalogSource}
            />
          )}

          {view === "shop" && (
            <section className="screen shop-screen" aria-labelledby="shop-title">
              <div className="shop-intro-grid">
                <article className="bento-card shop-intro-card">
                  <span className="section-kicker">Drop corrente</span>
                  <h1 id="shop-title">Capi diversi, per davvero.</h1>
                  <p>Ogni lavorazione reagisce in modo proprio. Le variazioni sono parte del pezzo, non un difetto da nascondere.</p>
                </article>

                <aside className="bento-card shop-info-card" aria-label="Informazioni sul drop">
                  <div><span>Disponibili</span><strong>{catalogProducts.length}</strong></div>
                  <div><span>Tempo medio</span><strong>7–14 gg</strong></div>
                  <p className={catalogSource === "live" ? "source-pill is-live" : "source-pill"}>
                    <span aria-hidden="true" />{catalogSource === "live" ? "Catalogo live" : "Dati dimostrativi"}
                  </p>
                </aside>
              </div>

              <div className="bento-card filter-card">
                <div>
                  <span className="section-kicker">Filtra</span>
                  <p>{filteredProducts.length} risultati</p>
                </div>
                <div className="filter-pills" role="group" aria-label="Filtra i prodotti">
                  {[
                    ["all", "Tutto"],
                    ["tee", "T-shirt"],
                    ["hoodie", "Felpe"],
                    ["oneoff", "One/off"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={shopFilter === id ? "is-selected" : ""}
                      onClick={() => setShopFilter(id as "all" | ProductCategory)}
                      aria-pressed={shopFilter === id}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredProducts.length ? (
                <div className="catalog-grid">
                  {filteredProducts.map((product, index) => (
                    <article className={index === 0 ? "catalog-card is-featured" : "catalog-card"} key={product.id}>
                      <div className="product-stage" style={{ "--product-color": product.color, "--product-reaction": product.reaction } as CSSProperties}>
                        <span className="craft-pill">Fatto a mano</span>
                        {product.image ? (
                          <Image className="product-photo" src={product.image} alt={`${product.name}, ${product.kind}`} fill sizes="(max-width: 680px) 88vw, 420px" />
                        ) : (
                          <GarmentVisual
                            type={product.category === "hoodie" ? "hoodie" : "tee"}
                            color={product.color}
                            reaction={product.reaction}
                            art={product.art}
                          />
                        )}
                      </div>
                      <div className="catalog-copy">
                        <div>
                          <p>{product.kind} · {product.id}</p>
                          <h2>{product.name}</h2>
                        </div>
                        <strong>{money(product.price)}</strong>
                      </div>
                      <div className="catalog-meta">
                        <span>{product.status}</span>
                        <span>XS–XXL</span>
                      </div>
                      <button
                        className="inline-action"
                        type="button"
                        onClick={() => addToCart(product.name, `${product.kind} · ${product.status}`, product.price)}
                      >
                        Aggiungi al carrello <span aria-hidden="true">→</span>
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="bento-card empty-catalog">
                  <span aria-hidden="true">○</span>
                  <h2>Il prossimo drop sta prendendo forma.</h2>
                  <p>Torna presto oppure crea subito un capo nel Custom Lab.</p>
                  <button type="button" className="soft-button" onClick={() => navigate("lab")}>Apri il Custom Lab</button>
                </div>
              )}

              <button type="button" className="lab-invite-card" onClick={() => navigate("lab")}>
                <span className="section-kicker">Non trovi il tuo?</span>
                <strong>Parti da una base neutra e componilo tu.</strong>
                <span className="round-arrow" aria-hidden="true">→</span>
              </button>
            </section>
          )}

          {view === "lab" && (
            <section className="screen lab-screen" aria-labelledby="lab-title">
              <div className="lab-heading-grid">
                <article className="bento-card lab-heading-card">
                  <span className="section-kicker">Custom Lab</span>
                  <h1 id="lab-title">Componilo come un gioco.</h1>
                  <p>Scegli la base, il segno e la reazione. L’anteprima cambia con te, passo dopo passo.</p>
                </article>
                <aside className="bento-card lab-facts-card">
                  <div><strong>4</strong><span>scelte semplici</span></div>
                  <div><strong>49 €</strong><span>prezzo di partenza</span></div>
                </aside>
              </div>

              <div className="lab-workspace">
                <section className="bento-card preview-card" aria-label="Anteprima del capo personalizzato">
                  <div className="preview-toolbar">
                    <span>Anteprima · {placement === "front" ? "Fronte" : "Retro"}</span>
                    <span>{activeColor.name} + {activeReaction.name}</span>
                  </div>
                  <div className="preview-well" style={previewStyle}>
                    <GarmentVisual
                      type={garment}
                      color={activeColor.hex}
                      reaction={activeReaction.hex}
                      art={design}
                      placement={placement}
                      scale={printScale}
                      customPreview={customPreview}
                    />
                  </div>
                  <div className="preview-summary" aria-live="polite">
                    <div><span>Base</span><strong>{garment === "tee" ? "T-shirt" : "Felpa"} · {garmentSize}</strong></div>
                    <div><span>Segno</span><strong>{design === "custom" ? customFileName || "File personale" : designs.find((item) => item.id === design)?.name}</strong></div>
                    <div><span>Totale</span><strong>{money(labPrice)}</strong></div>
                  </div>
                </section>

                <section className="bento-card builder-card" ref={builderCardRef} aria-label="Configuratore del capo">
                  <div className="builder-topline">
                    <div>
                      <span className="section-kicker">Passaggio {labStep} di 4</span>
                      <h2 ref={builderHeadingRef} tabIndex={-1}>{["Scegli la base", "Scegli il segno", "Scegli la reazione", "Controlla tutto"][labStep - 1]}</h2>
                    </div>
                    <span className="step-count">{labStep}/4</span>
                  </div>

                  <div className="progress-pills" aria-label="Passaggi del configuratore">
                    {["Base", "Segno", "Reazione", "Riepilogo"].map((label, index) => {
                      const step = index + 1;
                      return (
                        <button
                          type="button"
                          key={label}
                          className={labStep === step ? "is-current" : labStep > step ? "is-complete" : ""}
                          onClick={() => goToLabStep(step)}
                          aria-current={labStep === step ? "step" : undefined}
                          aria-label={`Passaggio ${step}: ${label}`}
                        >
                          <span>{labStep > step ? "✓" : step}</span>
                          <small>{label}</small>
                        </button>
                      );
                    })}
                  </div>

                  {labStep === 1 && (
                    <div className="builder-body">
                      <fieldset>
                        <legend>Capo</legend>
                        <div className="option-grid two-columns">
                          <button type="button" className={garment === "tee" ? "option-tile is-selected" : "option-tile"} onClick={() => updateSelection(setGarment, "tee")} aria-pressed={garment === "tee"}>
                            <span className="option-icon tee-icon" aria-hidden="true" />
                            <strong>T-shirt</strong><small>240 g · da 49 €</small>
                          </button>
                          <button type="button" className={garment === "hoodie" ? "option-tile is-selected" : "option-tile"} onClick={() => updateSelection(setGarment, "hoodie")} aria-pressed={garment === "hoodie"}>
                            <span className="option-icon hoodie-icon" aria-hidden="true" />
                            <strong>Felpa</strong><small>400 g · da 89 €</small>
                          </button>
                        </div>
                      </fieldset>

                      <fieldset>
                        <legend>Colore della base</legend>
                        <div className="color-options">
                          {garmentColors.map((color) => (
                            <button type="button" key={color.id} className={garmentColor === color.id ? "is-selected" : ""} onClick={() => selectGarmentColor(color.id)} aria-pressed={garmentColor === color.id}>
                              <span style={{ backgroundColor: color.hex }} aria-hidden="true" />
                              <small>{color.name}</small>
                            </button>
                          ))}
                        </div>
                      </fieldset>

                      <fieldset>
                        <legend>Taglia</legend>
                        <div className="choice-pills">
                          {["XS", "S", "M", "L", "XL", "XXL"].map((size) => (
                            <button key={size} type="button" className={garmentSize === size ? "is-selected" : ""} onClick={() => updateSelection(setGarmentSize, size)} aria-pressed={garmentSize === size}>{size}</button>
                          ))}
                        </div>
                      </fieldset>
                    </div>
                  )}

                  {labStep === 2 && (
                    <div className="builder-body">
                      <fieldset>
                        <legend>Archivio Bleachwears</legend>
                        <div className="design-options">
                          {designs.map((item) => (
                            <button key={item.id} type="button" className={design === item.id ? "design-tile is-selected" : "design-tile"} onClick={() => updateSelection(setDesign, item.id)} aria-pressed={design === item.id}>
                              <span aria-hidden="true">{item.symbol}</span>
                              <div><strong>{item.name}</strong><small>{item.note}</small></div>
                            </button>
                          ))}
                        </div>
                      </fieldset>

                      <button type="button" className="catalog-link" onClick={() => setToast("Il catalogo PDF sarà collegato appena definitivo")}>
                        <span><strong>Catalogo completo</strong><small>PDF in preparazione</small></span><span aria-hidden="true">→</span>
                      </button>

                      <fieldset>
                        <legend>Oppure usa una tua immagine</legend>
                        <label className={design === "custom" ? "upload-card is-selected" : "upload-card"}>
                          <input type="file" accept=".png,.jpg,.jpeg,.webp,.heic,.heif,.pdf,image/heic,image/heif" onChange={handleUpload} />
                          <span className="upload-symbol" aria-hidden="true">＋</span>
                          <span><strong>{customFileName || "Carica dalla galleria"}</strong><small>JPG, PNG, WEBP, HEIC o PDF · max 10 MB</small></span>
                        </label>
                        <p className="field-helper">Il file resta sul dispositivo in questa versione dimostrativa.</p>
                      </fieldset>
                    </div>
                  )}

                  {labStep === 3 && (
                    <div className="builder-body">
                      <fieldset>
                        <legend>Reazione compatibile con {activeColor.name}</legend>
                        <div className="reaction-options">
                          {availableReactions.map((option) => (
                            <button type="button" key={option.id} className={reaction === option.id ? "reaction-tile is-selected" : "reaction-tile"} onClick={() => updateSelection(setReaction, option.id)} aria-pressed={reaction === option.id}>
                              <span className="reaction-dot" style={{ "--reaction-base": activeColor.hex, "--reaction-mark": option.hex } as CSSProperties} aria-hidden="true" />
                              <div><strong>{option.name}</strong><small>Effetto candeggina</small></div>
                            </button>
                          ))}
                          <button type="button" className="reaction-tile is-disabled" disabled>
                            <span className="reaction-dot acrylic-dot" aria-hidden="true" />
                            <div><strong>Acrilico</strong><small>In arrivo</small></div>
                          </button>
                        </div>
                      </fieldset>

                      <div className="split-fields">
                        <fieldset>
                          <legend>Posizione</legend>
                          <div className="choice-pills two-up">
                            <button type="button" className={placement === "front" ? "is-selected" : ""} onClick={() => updateSelection(setPlacement, "front")} aria-pressed={placement === "front"}>Fronte</button>
                            <button type="button" className={placement === "back" ? "is-selected" : ""} onClick={() => updateSelection(setPlacement, "back")} aria-pressed={placement === "back"}>Retro +8 €</button>
                          </div>
                        </fieldset>
                        <fieldset>
                          <legend>Dimensione</legend>
                          <div className="choice-pills three-up">
                            {(["S", "M", "L"] as PrintScale[]).map((size) => (
                              <button type="button" key={size} className={printScale === size ? "is-selected" : ""} onClick={() => updateSelection(setPrintScale, size)} aria-pressed={printScale === size}>{size}</button>
                            ))}
                          </div>
                        </fieldset>
                      </div>
                    </div>
                  )}

                  {labStep === 4 && (
                    <div className="builder-body review-body">
                      <div className="review-grid">
                        <div><span>Capo</span><strong>{garment === "tee" ? "T-shirt 240 g" : "Felpa 400 g"}</strong><small>Taglia {garmentSize}</small></div>
                        <div><span>Colore</span><strong>{activeColor.name}</strong><small>Base selezionata</small></div>
                        <div><span>Segno</span><strong>{design === "custom" ? customFileName || "File personale" : designs.find((item) => item.id === design)?.name}</strong><small>{placement === "front" ? "Fronte" : "Retro"} · misura {printScale}</small></div>
                        <div><span>Reazione</span><strong>{activeReaction.name}</strong><small>Lavorazione manuale</small></div>
                      </div>
                      <div className="review-total"><span>Totale indicativo</span><strong>{money(labPrice)}</strong></div>
                      <label className="confirmation-row">
                        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                        <span>Ho controllato taglia e impostazioni.</span>
                      </label>
                      <button
                        className="primary-wide-action"
                        type="button"
                        disabled={!confirmed}
                        onClick={() => {
                          addToCart(
                            "Custom Reaction",
                            `${garment === "tee" ? "T-shirt" : "Felpa"} ${garmentSize} · ${activeColor.name} · ${design === "custom" ? customFileName || "file personale" : designs.find((item) => item.id === design)?.name} · ${activeReaction.name} · ${placement === "front" ? "fronte" : "retro"} · segno ${printScale}`,
                            labPrice,
                          );
                          setConfirmed(false);
                        }}
                      >
                        Aggiungi al carrello <span>{money(labPrice)} →</span>
                      </button>
                      <p className="field-helper">L’anteprima è indicativa: ogni lavorazione manuale produce variazioni uniche.</p>
                    </div>
                  )}

                  <div className="builder-actions">
                    <button type="button" className="ghost-action" onClick={() => goToLabStep(labStep - 1)} disabled={labStep === 1}>Indietro</button>
                    {labStep < 4 && <button type="button" className="solid-action" onClick={() => goToLabStep(labStep + 1)}>Continua <span aria-hidden="true">→</span></button>}
                  </div>
                </section>
              </div>
            </section>
          )}
        </main>

        <footer className="footer-card">
          <div><GridMark /><strong>bleachwears</strong></div>
          <p>Coloriamo togliendo colore. Ogni capo passa dalle nostre mani e diventa irripetibile.</p>
          <div><span>Fatto a mano in Italia · © 2026</span><button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Torna su ↑</button></div>
        </footer>

      </div>

      {cartOpen && (
        <div className="cart-scrim" role="presentation" onMouseDown={closeCart}>
          <aside className="cart-sheet" ref={cartSheetRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="cart-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="cart-header">
              <div><span className="section-kicker">Il tuo carrello</span><h2 id="cart-title">{cartItems.length ? `${cartItems.length} ${cartItems.length === 1 ? "capo" : "capi"}` : "Ancora vuoto"}</h2></div>
              <button ref={cartCloseButtonRef} type="button" onClick={closeCart} aria-label="Chiudi carrello">×</button>
            </div>
            {cartItems.length === 0 ? (
              <div className="cart-empty">
                <GridMark />
                <p>Inizia da un drop oppure crea qualcosa nel Custom Lab.</p>
                <button type="button" className="solid-action" onClick={() => closeCartAndNavigate("shop")}>Scopri il drop</button>
              </div>
            ) : (
              <>
                <ul className="cart-items">
                  {cartItems.map((item) => (
                    <li key={item.id}>
                      <span className="cart-item-swatch" aria-hidden="true" />
                      <div><strong>{item.name}</strong><small>{item.detail}</small></div>
                      <b>{money(item.price)}</b>
                      <button type="button" onClick={() => setCartItems((current) => current.filter((entry) => entry.id !== item.id))} aria-label={`Rimuovi ${item.name}`}>×</button>
                    </li>
                  ))}
                </ul>
                <div className="cart-total"><span>Totale</span><strong>{money(cartItems.reduce((sum, item) => sum + item.price, 0))}</strong></div>
                <button type="button" className="primary-wide-action" onClick={() => setToast("Checkout non ancora attivo: questa è una preview di design")}>Vai al checkout <span>→</span></button>
                <p className="cart-helper">Pagamenti e spedizioni verranno collegati nella fase e-commerce.</p>
              </>
            )}
          </aside>
        </div>
      )}

      <div className={toast ? "toast-pill is-visible" : "toast-pill"} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}

function BentoHome({
  navigate,
  notify,
  products,
  catalogSource,
}: {
  navigate: (view: View) => void;
  notify: (message: string) => void;
  products: Product[];
  catalogSource: CatalogSource;
}) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [reelsInView, setReelsInView] = useState(false);
  const reelSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const node = reelSectionRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setReelsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "320px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function handleNewsletter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    notify("Modulo in anteprima: l’iscrizione sarà collegata nella prossima fase");
    event.currentTarget.reset();
  }

  const socials: { name: string; handle: string; href?: string }[] = [
    { name: "Instagram", handle: "@bleach_wears", href: INSTAGRAM_PROFILE },
    { name: "TikTok", handle: "@bleach_wears", href: TIKTOK_PROFILE },
    { name: "WhatsApp", handle: "Parla con noi" },
    { name: "Email", handle: "Scrivici" },
  ];

  return (
    <section className="screen home-screen" aria-labelledby="home-title">
      <div className="home-board">
        <article className="poster-hero">
          <div className="poster-copy">
            <div className="poster-meta">
              <span>Collettivo</span>
              <span>Italia</span>
              <span>Drop 01 / 2026</span>
            </div>
            <h1 id="home-title" className="poster-title" aria-label="Candeggina, cotone, mani: un pezzo su uno">
              <span>Candeggina</span>
              <span className="is-outline"><b aria-hidden="true">+</b>cotone</span>
              <span><b aria-hidden="true">+</b>mani</span>
              <span className="is-eq">= 1/1</span>
            </h1>
            <p className="poster-lead">
              Sbiadiamo capi a mano, uno alla volta. Nessuna serie, nessuna stampa ripetibile:
              si parte dalla stessa idea e si finisce con un pezzo che esiste solo lì.
            </p>
            <div className="poster-actions">
              <button type="button" className="poster-cta" onClick={() => navigate("shop")}>Guarda il drop <span aria-hidden="true">→</span></button>
              <button type="button" className="poster-cta is-ghost" onClick={() => navigate("lab")}>Fai il tuo pezzo</button>
            </div>
          </div>
          <div className="poster-art">
            <span className="poster-halftone" aria-hidden="true" />
            <div className="poster-plate">
              <span className="sticker is-tape" aria-hidden="true">drop 01 · 2026</span>
              <span className="poster-photo">
                <Image
                  src="/feed/reel-aquila.jpg"
                  alt="Felpa nera con ali e pugnale dipinti a mano sul retro"
                  fill
                  sizes="(max-width: 680px) 76vw, 400px"
                  priority
                />
              </span>
              <span className="sticker is-round" aria-hidden="true">no reprint · 1 of 1</span>
            </div>
          </div>
        </article>

        <article className="bento-card social-card">
          <div className="card-heading-row"><div><span className="section-kicker">Link hub</span><h2>Troviamoci.</h2></div><span className="availability-pill">Seguici</span></div>
          <div className="social-grid">
            {socials.map((social) =>
              social.href ? (
                <a key={social.name} href={social.href} target="_blank" rel="noopener noreferrer">
                  <span><strong>{social.name}</strong><small>{social.handle}</small></span><span aria-hidden="true">↗</span>
                </a>
              ) : (
                <button key={social.name} type="button" onClick={() => notify(`${social.name} non è ancora collegato`)}>
                  <span><strong>{social.name}</strong><small>{social.handle}</small></span><span aria-hidden="true">→</span>
                </button>
              ),
            )}
          </div>
        </article>

        <button type="button" className="lab-teaser-card" onClick={() => navigate("lab")}>
          <span className="section-kicker">Custom Lab</span>
          <strong>Componilo come un gioco.</strong>
          <span className="lab-mini-grid" aria-hidden="true"><i /><i /><i /><i /></span>
          <span className="round-arrow" aria-hidden="true">→</span>
        </button>

        <article className="bento-card drop-preview-card">
          <div className="card-heading-row">
            <div><span className="section-kicker">Sul banco</span><h2>Pronti adesso.</h2></div>
            <span className={catalogSource === "live" ? "source-pill is-live" : "source-pill"}>{catalogSource === "live" ? "Live" : "Preview"}</span>
          </div>
          <div className="shelf-list">
            {products.length ? products.map((product) => (
              <div className="shelf-row" key={product.id}>
                <span className="shelf-swatch" style={{ backgroundColor: product.color }} aria-hidden="true" />
                <span className="shelf-name"><strong>{product.name}</strong><small>{product.kind}</small></span>
                <b className="shelf-price">{money(product.price)}</b>
              </div>
            )) : <p>Il prossimo drop sta prendendo forma.</p>}
          </div>
          <button type="button" className="soft-button" onClick={() => navigate("shop")}>Vedi tutto il drop <span aria-hidden="true">→</span></button>
        </article>

        <article className="bento-card instagram-card" id="instagram" ref={reelSectionRef}>
          <div className="card-heading-row">
            <div>
              <span className="section-kicker">Dal collettivo</span>
              <h2>La bacheca.</h2>
            </div>
            <a className="insta-follow" href={INSTAGRAM_PROFILE} target="_blank" rel="noopener noreferrer">
              Segui @bleach_wears <span aria-hidden="true">↗</span>
            </a>
          </div>

          <p className="insta-intro">
            Nasce tra amici, in direct: un tema, una base, una taglia. Il resto lo fa la candeggina.
            Qui sotto due reel e cinque lavori, presi dal profilo così come sono usciti dalle mani.
          </p>

          <div className="insta-reels">
            {instagramReels.map((reel) => (
              <div className="insta-reel" key={reel.code}>
                <div className="insta-player">
                  {reel.video && !reduceMotion && reelsInView ? (
                    <video
                      className="reel-video"
                      src={reel.video}
                      poster={reel.image}
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      disablePictureInPicture
                      tabIndex={-1}
                      aria-label={`${reel.title} — video di @bleach_wears`}
                    />
                  ) : (
                    <Image
                      src={reel.image}
                      alt={`${reel.title} — lavoro di @bleach_wears`}
                      fill
                      sizes="(max-width: 680px) 90vw, 300px"
                    />
                  )}
                </div>
                <div className="insta-reel-copy">
                  <span className="insta-meta">
                    <span className="insta-kind">{reel.kind}</span>
                    <span className="insta-date">{reel.date}</span>
                  </span>
                  <strong>{reel.title}</strong>
                  <span className="insta-caption">{reel.caption}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="insta-wall">
            {instagramPosts.map((post) => (
              <article className="insta-post" key={post.url}>
                <span className="insta-photo">
                  <Image src={post.image} alt={`${post.title} — pezzo di @bleach_wears`} fill sizes="(max-width: 680px) 84vw, 230px" />
                </span>
                <span className="insta-meta">
                  <span className="insta-kind">{post.kind}</span>
                  <span className="insta-date">{post.date}</span>
                </span>
                <strong>{post.title}</strong>
                <span className="insta-caption">{post.caption}</span>
                <span className="insta-source">Dal profilo @bleach_wears</span>
              </article>
            ))}
          </div>
        </article>

        <article className="bento-card process-card">
          <span className="section-kicker">Come funziona</span>
          <h2>Dal niente al capo.</h2>
          <ol>
            <li><span>1</span><div><strong>Base</strong><small>T-shirt o felpa</small></div></li>
            <li><span>2</span><div><strong>Segno</strong><small>Archivio o tuo file</small></div></li>
            <li><span>3</span><div><strong>Reazione</strong><small>Colore e posizione</small></div></li>
          </ol>
        </article>

        <article className="bento-card craft-card">
          <span className="section-kicker">Fatto a mano</span>
          <blockquote>“Nessuno può rifarlo identico. Nemmeno noi.”</blockquote>
          <div><span>Unico</span><span>Locale</span><span>Lento</span></div>
        </article>

        <article className="bento-card newsletter-card">
          <div><span className="section-kicker">Drop alert</span><h2>Quando esce roba nuova.</h2><p>Niente calendario. Scriviamo solo quando c’è un capo nuovo o uno slot libero nel lab.</p></div>
          <form onSubmit={handleNewsletter}>
            <label htmlFor="email">La tua email</label>
            <div><input id="email" type="email" required placeholder="nome@email.it" /><button type="submit" aria-label="Iscriviti alla lista">→</button></div>
            <small>Funzione in anteprima, nessun dato viene salvato.</small>
          </form>
        </article>
      </div>
    </section>
  );
}

function GridMark() {
  return <span className="grid-mark" aria-hidden="true"><i /><i /><i /><i /></span>;
}

function GarmentVisual({
  type,
  color,
  reaction,
  art,
  placement = "front",
  scale = "M",
  customPreview = "",
}: {
  type: GarmentType;
  color: string;
  reaction: string;
  art: string;
  placement?: Placement;
  scale?: PrintScale;
  customPreview?: string;
}) {
  const style = {
    "--garment-fill": color,
    "--mark-fill": reaction,
  } as CSSProperties;

  return (
    <div className={`garment-object garment-${type} mark-${scale.toLowerCase()} placement-${placement}`} style={style}>
      {type === "hoodie" && <span className="hood-piece" aria-hidden="true" />}
      <span className="garment-collar" aria-hidden="true" />
      <span className={`bleach-shape shape-${art}`} aria-hidden="true">
        {art === "custom" && customPreview && <Image src={customPreview} alt="" width={420} height={420} unoptimized />}
        {art === "custom" && !customPreview && "＋"}
      </span>
    </div>
  );
}
