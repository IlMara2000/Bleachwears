"use client";

import type { ChangeEvent, CSSProperties, FormEvent } from "react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ProductRow } from "@/lib/supabase/database.types";

type View = "links" | "shop" | "lab";
type ProductCategory = "tee" | "hoodie" | "oneoff";
type GarmentType = "tee" | "hoodie";
type Placement = "front" | "back";
type PrintScale = "S" | "M" | "L";

type Product = {
  id: string;
  name: string;
  category: ProductCategory;
  kind: string;
  price: number;
  status: string;
  color: string;
  reaction: string;
  art: "halo" | "bloom" | "static" | "ghost" | "void" | "oneoff";
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
    name: "HALO BURN",
    category: "tee",
    kind: "Tee 240 g",
    price: 49,
    status: "7–10 giorni",
    color: "#171717",
    reaction: "#d88954",
    art: "halo",
  },
  {
    id: "BW-T02",
    name: "NIGHT GARDEN",
    category: "tee",
    kind: "Tee 240 g",
    price: 55,
    status: "7–10 giorni",
    color: "#4d1d29",
    reaction: "#e8aa83",
    art: "bloom",
  },
  {
    id: "BW-T03",
    name: "STATIC FACE",
    category: "tee",
    kind: "Tee oversized",
    price: 59,
    status: "Serie limitata",
    color: "#17223c",
    reaction: "#cfa361",
    art: "static",
  },
  {
    id: "BW-H01",
    name: "GHOST SIGNAL",
    category: "hoodie",
    kind: "Felpa 400 g",
    price: 89,
    status: "10–14 giorni",
    color: "#151515",
    reaction: "#e2c090",
    art: "ghost",
  },
  {
    id: "BW-H02",
    name: "VOID BLOOM",
    category: "hoodie",
    kind: "Felpa 400 g",
    price: 99,
    status: "Serie limitata",
    color: "#352018",
    reaction: "#d78a56",
    art: "void",
  },
  {
    id: "BW-O01",
    name: "ONE/OFF #001",
    category: "oneoff",
    kind: "Pezzo unico",
    price: 119,
    status: "1 disponibile",
    color: "#22201f",
    reaction: "#d9ff00",
    art: "oneoff",
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
    { id: "gold", name: "Oro sporco", hex: "#d0a35d" },
    { id: "ice", name: "Ghiaccio", hex: "#bac5c0" },
  ],
  forest: [
    { id: "sun", name: "Sole", hex: "#d5b169" },
    { id: "moss", name: "Muschio chiaro", hex: "#a9a56c" },
  ],
  cocoa: [
    { id: "sand", name: "Sabbia", hex: "#c79b71" },
    { id: "amber", name: "Ambra", hex: "#d2753c" },
  ],
} as const;

const designs = [
  { id: "orbit", name: "Orbita 01", note: "Cerchi / organico" },
  { id: "bloom", name: "Red Bloom", note: "Fiore / radicale" },
  { id: "static", name: "Static Cut", note: "Segnale / ruvido" },
  { id: "ghost", name: "Ghost Mark", note: "Volto / astratto" },
] as const;

const navItems: { id: View; index: string; label: string; short: string }[] = [
  { id: "links", index: "01", label: "Trovaci", short: "Link" },
  { id: "shop", index: "02", label: "Drop", short: "Drop" },
  { id: "lab", index: "03", label: "Custom Lab", short: "Lab" },
];

function money(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function productFromRow(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
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
  const [catalogLive, setCatalogLive] = useState(false);

  const [labStep, setLabStep] = useState(1);
  const [garment, setGarment] = useState<GarmentType>("tee");
  const [garmentColor, setGarmentColor] = useState("black");
  const [garmentSize, setGarmentSize] = useState("M");
  const [design, setDesign] = useState("orbit");
  const [reaction, setReaction] = useState("rust");
  const [placement, setPlacement] = useState<Placement>("front");
  const [printScale, setPrintScale] = useState<PrintScale>("M");
  const [customFileName, setCustomFileName] = useState("");
  const [customPreview, setCustomPreview] = useState("");
  const [confirmed, setConfirmed] = useState(true);
  const cartSequence = useRef(0);
  const mainRef = useRef<HTMLElement>(null);
  const cartDrawerRef = useRef<HTMLElement>(null);
  const cartTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash.replace("#", "") as View;
      if (navItems.some((item) => item.id === hash)) setView(hash);
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let cancelled = false;
    void supabase
      .from("products")
      .select("id, slug, name, category, kind, price_cents, status, color, reaction, art, active, position, created_at, updated_at")
      .eq("active", true)
      .order("position", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled || error || !data?.length) return;
        setCatalogProducts(data.map(productFromRow));
        setCatalogLive(true);
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
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCart();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => cartDrawerRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [cartOpen]);

  const activeColor =
    garmentColors.find((color) => color.id === garmentColor) || garmentColors[0];
  const availableReactions = reactionMap[garmentColor as keyof typeof reactionMap];
  const activeReaction =
    availableReactions.find((option) => option.id === reaction) || availableReactions[0];

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
    window.history.replaceState(null, "", `#${next}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.requestAnimationFrame(() => mainRef.current?.focus());
  }

  function openCart() {
    cartTriggerRef.current = document.activeElement as HTMLElement | null;
    setCartOpen(true);
  }

  function closeCart() {
    setCartOpen(false);
    window.requestAnimationFrame(() => cartTriggerRef.current?.focus());
  }

  function addToCart(name: string, detail: string, price: number) {
    cartSequence.current += 1;
    const item: CartItem = {
      id: `cart-${cartSequence.current}`,
      name,
      detail,
      price,
    };
    setCartItems((current) => [...current, item]);
    setToast(`${name} aggiunto al carrello`);
  }

  function selectGarmentColor(colorId: string) {
    setGarmentColor(colorId);
    setReaction(reactionMap[colorId as keyof typeof reactionMap][0].id);
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
    if (!allowedTypes.has(file.type)) {
      setToast("Formato non supportato: usa JPG, PNG, WEBP o PDF");
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
    if (file.type.startsWith("image/")) {
      setCustomPreview(URL.createObjectURL(file));
    } else {
      setCustomPreview("");
    }
    setToast("Grafica personale caricata");
  }

  const previewStyle = {
    "--garment-color": activeColor.hex,
    "--reaction-color": activeReaction.hex,
  } as CSSProperties;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Vai al contenuto
      </a>

      <header className="site-header">
        <button className="brand-lockup" type="button" onClick={() => navigate("links")} aria-label="Bleachwears, vai alla home">
          <span className="brand-mark" aria-hidden="true">
            <span>B/</span>
            <span>W</span>
          </span>
          <span className="brand-name">BLEACHWEARS</span>
        </button>

        <nav className="desktop-nav" aria-label="Navigazione principale">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? "nav-button active" : "nav-button"}
              onClick={() => navigate(item.id)}
              aria-current={view === item.id ? "page" : undefined}
            >
              <span>{item.index}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <button className="cart-button" type="button" onClick={openCart} aria-label={`Apri carrello, ${cartItems.length} articoli`}>
          <span>CARRELLO</span>
          <strong>{String(cartItems.length).padStart(2, "0")}</strong>
        </button>
      </header>

      <main id="main-content" ref={mainRef} tabIndex={-1}>
        {view === "links" && (
          <LinksView
            navigate={navigate}
            notify={setToast}
          />
        )}

        {view === "shop" && (
          <section className="view-section shop-view" aria-labelledby="shop-title">
            <div className="section-heading red-heading">
              <p className="eyebrow">DROP_01 / FATTO A MANO / 2026 <span className={catalogLive ? "catalog-status live" : "catalog-status"}>{catalogLive ? "SUPABASE LIVE" : "CATALOGO LOCALE"}</span></p>
              <h1 id="shop-title">NESSUN CLONE PERFETTO.</h1>
              <p>Ogni pezzo reagisce in modo diverso. Le piccole variazioni non sono difetti: sono la firma del processo.</p>
            </div>

            <div className="filter-bar" role="group" aria-label="Filtra i prodotti">
              {[
                ["all", "Tutto"],
                ["tee", "T-shirt"],
                ["hoodie", "Felpe"],
                ["oneoff", "One/off"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={shopFilter === id ? "filter-button active" : "filter-button"}
                  onClick={() => setShopFilter(id as "all" | ProductCategory)}
                  aria-pressed={shopFilter === id}
                >
                  {label}
                </button>
              ))}
              <span className="filter-count">{filteredProducts.length} PEZZI</span>
            </div>

            <div className="product-grid">
              {filteredProducts.map((product, index) => (
                <article className="product-card" key={product.id}>
                  <div className={`product-visual visual-${product.art}`} style={{ "--product": product.color, "--bleach": product.reaction } as CSSProperties}>
                    <span className="product-index">{String(index + 1).padStart(2, "0")}</span>
                    <div className={`mini-garment ${product.category === "hoodie" ? "hoodie" : "tee"}`} aria-hidden="true">
                      <span className="mini-art" />
                    </div>
                    <span className="handmade-stamp">HAND<br />MADE</span>
                  </div>
                  <div className="product-copy">
                    <div>
                      <p>{product.id} · {product.kind}</p>
                      <h2>{product.name}</h2>
                    </div>
                    <strong>{money(product.price)}</strong>
                  </div>
                  <div className="product-meta">
                    <span>{product.status}</span>
                    <span>XS—XXL</span>
                  </div>
                  <button
                    className="add-button"
                    type="button"
                    onClick={() => addToCart(product.name, `${product.kind} · ${product.status}`, product.price)}
                  >
                    AGGIUNGI <span aria-hidden="true">↗</span>
                  </button>
                </article>
              ))}
            </div>

            <div className="custom-banner">
              <span className="burst" aria-hidden="true">★</span>
              <div>
                <p className="eyebrow">NON TROVI IL TUO?</p>
                <h2>COSTRUISCILO TU.</h2>
              </div>
              <button type="button" className="inverse-button" onClick={() => navigate("lab")}>ENTRA NEL LAB <span aria-hidden="true">→</span></button>
            </div>
          </section>
        )}

        {view === "lab" && (
          <section className="view-section lab-view" aria-labelledby="lab-title">
            <div className="lab-intro">
              <p className="eyebrow">CUSTOM LAB / GIOCA, MESCOLA, INDOSSA</p>
              <h1 id="lab-title">CREA LA TUA REAZIONE.</h1>
              <p>Quattro mosse, zero regole inutili. L’anteprima cambia mentre scegli.</p>
            </div>

            <div className="stepper" aria-label="Passaggi del configuratore">
              {["La tela", "Il segno", "La reazione", "Ultimo check"].map((label, index) => {
                const step = index + 1;
                return (
                  <button
                    type="button"
                    key={label}
                    className={labStep === step ? "step active" : labStep > step ? "step done" : "step"}
                    onClick={() => setLabStep(step)}
                    aria-current={labStep === step ? "step" : undefined}
                  >
                    <span>{String(step).padStart(2, "0")}</span>
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="lab-grid">
              <div className="preview-column">
                <div className="preview-stage">
                  <div className="preview-label top-left">ANTEPRIMA / {placement === "front" ? "FRONTE" : "RETRO"}</div>
                  <div className="preview-label bottom-right">{activeColor.name} × {activeReaction.name}</div>
                  <div className={`garment-preview ${garment} print-${printScale.toLowerCase()} place-${placement}`} style={previewStyle}>
                    {garment === "hoodie" && <span className="hood-shape" aria-hidden="true" />}
                    <div className={`design-mark design-${design}`} aria-hidden="true">
                      {design === "bloom" && <span>✹</span>}
                      {design === "static" && <span>{"///"}</span>}
                      {design === "ghost" && <span>●</span>}
                      {design === "custom" && customPreview && <Image src={customPreview} alt="" width={400} height={400} unoptimized />}
                      {design === "custom" && !customPreview && <span>+</span>}
                    </div>
                  </div>
                  <span className="chem-badge" aria-hidden="true">NaClO<br />LAB</span>
                </div>
                <div className="live-summary" aria-live="polite">
                  <div><span>BASE</span><strong>{garment === "tee" ? "T-SHIRT" : "FELPA"} / {garmentSize}</strong></div>
                  <div><span>SEGNO</span><strong>{design === "custom" ? customFileName || "TUO FILE" : designs.find((item) => item.id === design)?.name}</strong></div>
                  <div><span>PREZZO</span><strong>{money(labPrice)}</strong></div>
                </div>
              </div>

              <div className="control-panel">
                <div className="panel-head">
                  <span>STEP_{String(labStep).padStart(2, "0")}</span>
                  <strong>{["SCEGLI LA TELA", "SCEGLI IL SEGNO", "SCEGLI LA REAZIONE", "ULTIMO CHECK"][labStep - 1]}</strong>
                </div>

                {labStep === 1 && (
                  <div className="panel-body">
                    <fieldset>
                      <legend>Da cosa vuoi partire?</legend>
                      <div className="choice-grid two">
                        <button type="button" className={garment === "tee" ? "choice-card selected" : "choice-card"} onClick={() => setGarment("tee")} aria-pressed={garment === "tee"}>
                          <span className="choice-number">01</span>
                          <strong>T-SHIRT</strong>
                          <small>240 g · da €49</small>
                        </button>
                        <button type="button" className={garment === "hoodie" ? "choice-card selected" : "choice-card"} onClick={() => setGarment("hoodie")} aria-pressed={garment === "hoodie"}>
                          <span className="choice-number">02</span>
                          <strong>FELPA</strong>
                          <small>400 g · da €89</small>
                        </button>
                      </div>
                    </fieldset>

                    <fieldset>
                      <legend>Scegli il colore della base</legend>
                      <div className="swatch-grid">
                        {garmentColors.map((color) => (
                          <button
                            type="button"
                            key={color.id}
                            className={garmentColor === color.id ? "swatch selected" : "swatch"}
                            onClick={() => selectGarmentColor(color.id)}
                            aria-pressed={garmentColor === color.id}
                          >
                            <span style={{ backgroundColor: color.hex }} aria-hidden="true" />
                            {color.name}
                          </button>
                        ))}
                      </div>
                    </fieldset>

                    <fieldset>
                      <legend>La tua taglia</legend>
                      <div className="segmented-control size-control">
                        {["XS", "S", "M", "L", "XL", "XXL"].map((size) => (
                          <button key={size} type="button" onClick={() => setGarmentSize(size)} className={garmentSize === size ? "active" : ""} aria-pressed={garmentSize === size}>{size}</button>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                )}

                {labStep === 2 && (
                  <div className="panel-body">
                    <fieldset>
                      <legend>Prendine uno dal nostro archivio</legend>
                      <div className="design-grid">
                        {designs.map((item, index) => (
                          <button key={item.id} type="button" className={design === item.id ? `design-choice design-${item.id} selected` : `design-choice design-${item.id}`} onClick={() => setDesign(item.id)} aria-pressed={design === item.id}>
                            <span className="design-thumb" aria-hidden="true">{item.id === "bloom" ? "✹" : item.id === "static" ? "///" : item.id === "ghost" ? "●" : "◎"}</span>
                            <span><strong>{item.name}</strong><small>{item.note}</small></span>
                            <em>{String(index + 1).padStart(2, "0")}</em>
                          </button>
                        ))}
                      </div>
                    </fieldset>

                    <div className="catalog-row">
                      <button type="button" className="text-button" onClick={() => setToast("Qui collegheremo il PDF con il catalogo definitivo")}>SFOGLIA IL PDF COMPLETO <span aria-hidden="true">↗</span></button>
                      <span>CATALOGO DEMO / 04 SEGNI</span>
                    </div>

                    <fieldset>
                      <legend>Oppure portaci la tua immagine</legend>
                      <label className={design === "custom" ? "upload-zone selected" : "upload-zone"}>
                        <input type="file" accept=".png,.jpg,.jpeg,.webp,.pdf" onChange={handleUpload} />
                        <span className="upload-plus">+</span>
                        <span><strong>{customFileName || "CARICA DALLA GALLERIA"}</strong><small>JPG, PNG, WEBP o PDF · max 10 MB</small></span>
                      </label>
                      <p className="helper-copy">Caricando il file confermi di avere il diritto di usarlo.</p>
                    </fieldset>
                  </div>
                )}

                {labStep === 3 && (
                  <div className="panel-body">
                    <fieldset>
                      <legend>Quale reazione vuoi ottenere?</legend>
                      <p className="field-note">Opzioni compatibili con {activeColor.name}. Il risultato reale può variare.</p>
                      <div className="reaction-grid">
                        {availableReactions.map((option) => (
                          <button type="button" key={option.id} className={reaction === option.id ? "reaction-card selected" : "reaction-card"} onClick={() => setReaction(option.id)} aria-pressed={reaction === option.id}>
                            <span className="reaction-sample" style={{ "--sample-base": activeColor.hex, "--sample-reaction": option.hex } as CSSProperties} aria-hidden="true" />
                            <strong>{option.name}</strong>
                            <small>Effetto bleach</small>
                          </button>
                        ))}
                        <button type="button" className="reaction-card coming-soon" disabled>
                          <span className="reaction-sample acrylic" aria-hidden="true" />
                          <strong>Acrilico</strong>
                          <small>In arrivo</small>
                        </button>
                      </div>
                    </fieldset>

                    <fieldset>
                      <legend>Dove lo mettiamo?</legend>
                      <div className="segmented-control">
                        <button type="button" className={placement === "front" ? "active" : ""} onClick={() => setPlacement("front")} aria-pressed={placement === "front"}>FRONTE</button>
                        <button type="button" className={placement === "back" ? "active" : ""} onClick={() => setPlacement("back")} aria-pressed={placement === "back"}>RETRO +€8</button>
                      </div>
                    </fieldset>

                    <fieldset>
                      <legend>Quanto grande?</legend>
                      <div className="segmented-control">
                        {(["S", "M", "L"] as PrintScale[]).map((size) => (
                          <button type="button" key={size} className={printScale === size ? "active" : ""} onClick={() => setPrintScale(size)} aria-pressed={printScale === size}>SEGNO {size}</button>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                )}

                {labStep === 4 && (
                  <div className="panel-body final-check">
                    <div className="check-poster">
                      <span>PROGETTO</span>
                      <strong>BW-{garment.toUpperCase()}-{activeColor.id.toUpperCase()}</strong>
                      <em>PRONTO DA REAGIRE</em>
                    </div>
                    <dl className="order-list">
                      <div><dt>Capo</dt><dd>{garment === "tee" ? "T-shirt 240 g" : "Felpa 400 g"} · {garmentSize}</dd></div>
                      <div><dt>Colore</dt><dd>{activeColor.name}</dd></div>
                      <div><dt>Segno</dt><dd>{design === "custom" ? customFileName || "File personale" : designs.find((item) => item.id === design)?.name}</dd></div>
                      <div><dt>Reazione</dt><dd>{activeReaction.name} · {placement === "front" ? "fronte" : "retro"} · {printScale}</dd></div>
                      <div className="total-row"><dt>Totale</dt><dd>{money(labPrice)}</dd></div>
                    </dl>
                    <label className="rights-check">
                      <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                      <span>Ho controllato taglia e impostazioni.</span>
                    </label>
                    <button className="big-cart-button" type="button" disabled={!confirmed} onClick={() => addToCart("CUSTOM REACTION", `${garment === "tee" ? "T-shirt" : "Felpa"} ${garmentSize} · ${activeColor.name} · ${design === "custom" ? customFileName || "file personale" : designs.find((item) => item.id === design)?.name} · ${activeReaction.name} · ${placement} · segno ${printScale}`, labPrice)}>
                      AGGIUNGI AL CARRELLO <span>{money(labPrice)} →</span>
                    </button>
                    <p className="manual-note">L’anteprima è indicativa: la lavorazione manuale rende ogni pezzo leggermente diverso.</p>
                  </div>
                )}

                <div className="panel-footer">
                  <button type="button" className="back-button" onClick={() => setLabStep((step) => Math.max(1, step - 1))} disabled={labStep === 1}>← INDIETRO</button>
                  {labStep < 4 && <button type="button" className="next-button" onClick={() => setLabStep((step) => Math.min(4, step + 1))}>AVANTI / STEP {String(labStep + 1).padStart(2, "0")} →</button>}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="site-footer">
        <div className="footer-wordmark">BLEACH<br />WEARS</div>
        <div className="footer-manifesto">
          <p className="eyebrow">MANIFESTO_001</p>
          <p>Coloriamo togliendo colore. Ogni capo passa dalle nostre mani, reagisce, cambia e diventa irripetibile.</p>
        </div>
        <div className="footer-meta">
          <span>MADE BY HAND IN ITALY</span>
          <span>© 2026 BLEACHWEARS</span>
          <button type="button" onClick={() => navigate("links")}>TORNA SU ↑</button>
        </div>
      </footer>

      <nav className="mobile-nav" aria-label="Navigazione mobile">
        {navItems.map((item) => (
          <button key={item.id} type="button" className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)} aria-current={view === item.id ? "page" : undefined}>
            <span>{item.index}</span>{item.short}
          </button>
        ))}
        <button type="button" onClick={openCart}><span>{String(cartItems.length).padStart(2, "0")}</span>Bag</button>
      </nav>

      {cartOpen && (
        <div className="cart-backdrop" role="presentation" onMouseDown={closeCart}>
          <aside className="cart-drawer" ref={cartDrawerRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="cart-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="cart-head">
              <div><p className="eyebrow">IL TUO DROP</p><h2 id="cart-title">CARRELLO / {String(cartItems.length).padStart(2, "0")}</h2></div>
              <button type="button" onClick={closeCart} aria-label="Chiudi carrello">×</button>
            </div>
            {cartItems.length === 0 ? (
              <div className="empty-cart"><span aria-hidden="true">∅</span><p>Qui è ancora tutto neutro.</p><button type="button" onClick={() => { closeCart(); navigate("shop"); }}>SCOPRI IL DROP →</button></div>
            ) : (
              <>
                <ul className="cart-list">
                  {cartItems.map((item, index) => (
                    <li key={item.id}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div><strong>{item.name}</strong><small>{item.detail}</small></div>
                      <b>{money(item.price)}</b>
                      <button type="button" onClick={() => setCartItems((current) => current.filter((entry) => entry.id !== item.id))} aria-label={`Rimuovi ${item.name}`}>×</button>
                    </li>
                  ))}
                </ul>
                <div className="cart-total"><span>TOTALE</span><strong>{money(cartItems.reduce((sum, item) => sum + item.price, 0))}</strong></div>
                <button type="button" className="checkout-button" onClick={() => setToast("Il checkout verrà collegato nella prossima fase")}>VAI AL CHECKOUT <span>→</span></button>
                <p className="cart-note">Checkout demo: pagamenti e spedizioni saranno collegati nella fase e-commerce.</p>
              </>
            )}
          </aside>
        </div>
      )}

      <div className={toast ? "toast visible" : "toast"} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}

function LinksView({ navigate, notify }: { navigate: (view: View) => void; notify: (message: string) => void }) {
  function handleNewsletter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    notify("Sei dentro. Niente spam, solo drop.");
    event.currentTarget.reset();
  }

  const socialLinks = [
    { number: "01", name: "INSTAGRAM", handle: "@bleachwears", accent: "red" },
    { number: "02", name: "TIKTOK", handle: "@bleachwears", accent: "cream" },
    { number: "03", name: "WHATSAPP", handle: "Parla con noi", accent: "acid" },
    { number: "04", name: "EMAIL", handle: "Scrivici", accent: "black" },
  ];

  return (
    <section className="links-view" aria-labelledby="hero-title">
      <div className="ticker" aria-hidden="true">
        <div>FATTO A MANO ★ NESSUN CLONE ★ CUSTOM BLEACH ★ FATTO A MANO ★ NESSUN CLONE ★ CUSTOM BLEACH ★</div>
      </div>

      <div className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow hero-eyebrow">BLEACH-CUSTOMIZED STREETWEAR / ITALIA</p>
          <h1 className="hero-title" id="hero-title">
            <span>INDOSSA</span>
            <span className="red-line">LA</span>
            <span className="outline-line">REAZIONE.</span>
          </h1>
          <div className="hero-note">
            <span aria-hidden="true">✦</span>
            <p>Partiamo da t-shirt e felpe scure. Togliamo colore, aggiungiamo segni, lasciamo che ogni pezzo diventi unico.</p>
          </div>
          <div className="hero-actions">
            <button type="button" className="primary-cta" onClick={() => navigate("lab")}>CREA IL TUO <span aria-hidden="true">↗</span></button>
            <button type="button" className="secondary-cta" onClick={() => navigate("shop")}>VEDI IL DROP <span aria-hidden="true">→</span></button>
          </div>
        </div>

        <div className="link-stack" aria-label="Link di Bleachwears">
          <div className="stack-title"><span>LINK IN BIO</span><strong>SEGUICI<br />OVUNQUE.</strong></div>
          {socialLinks.map((social) => (
            <button key={social.name} type="button" className={`social-link ${social.accent}`} onClick={() => notify(`Link ${social.name} pronto: inserisci l’URL ufficiale`)}>
              <span>{social.number}</span>
              <strong>{social.name}</strong>
              <small>{social.handle}</small>
              <em aria-hidden="true">↗</em>
            </button>
          ))}
          <p className="link-footnote">I collegamenti sono predisposti: basterà inserire gli URL ufficiali.</p>
        </div>

        <span className="hero-sticker sticker-one" aria-hidden="true">ONE<br />OF<br />ONE</span>
        <span className="hero-sticker sticker-two" aria-hidden="true">★</span>
      </div>

      <div className="portal-grid">
        <button type="button" className="portal-card drop-card" onClick={() => navigate("shop")}>
          <span className="portal-number">02 / DROP</span>
          <div className="portal-garment tee" aria-hidden="true"><span /></div>
          <div><p>PEZZI PRONTI / SERIE LIMITATE</p><h2>SHOPPA<br />IL DROP.</h2></div>
          <em>ENTRA ↗</em>
        </button>
        <button type="button" className="portal-card lab-card" onClick={() => navigate("lab")}>
          <span className="portal-number">03 / CUSTOM LAB</span>
          <div className="lab-orbit" aria-hidden="true"><span>+</span></div>
          <div><p>LA TUA BASE / IL TUO SEGNO</p><h2>CREA IL<br />TUO PEZZO.</h2></div>
          <em>GIOCA ↗</em>
        </button>
      </div>

      <div className="manifesto-strip">
        <div className="manifesto-index">MANIFESTO<br /><strong>001</strong></div>
        <blockquote>“IL DIFETTO È LA PARTE CHE NON SI PUÒ COPIARE.”</blockquote>
        <div className="manifesto-facts"><span>01 / ARTIGIANALE</span><span>02 / IRRIPETIBILE</span><span>03 / TUO</span></div>
      </div>

      <div className="newsletter-block">
        <div><p className="eyebrow">DROP ALERT / NO SPAM</p><h2>ENTRA NELLA LISTA.</h2></div>
        <form onSubmit={handleNewsletter}>
          <label htmlFor="email">La tua email</label>
          <div><input id="email" type="email" required placeholder="nome@email.it" /><button type="submit">DENTRO →</button></div>
        </form>
      </div>
    </section>
  );
}
