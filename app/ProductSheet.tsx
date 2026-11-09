"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CLOTHING_SIZES, money, type ClothingSize, type Product } from "@/lib/shop/catalog";

export function ProductSheet({
  product,
  position,
  onClose,
  onAdd,
}: {
  product: Product;
  position: number;
  onClose: () => void;
  onAdd: (product: Product, size: ClothingSize) => void;
}) {
  const [size, setSize] = useState<ClothingSize | null>(product.category === "oneoff" ? "M" : null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const scrollY = window.scrollY;
    const { overflow, position: bodyPosition, top, width } = document.body.style;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    const timer = window.requestAnimationFrame(() => closeRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!sheetRef.current.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(timer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      document.body.style.position = bodyPosition;
      document.body.style.top = top;
      document.body.style.width = width;
      window.scrollTo({ top: scrollY, behavior: "auto" });
      returnFocusRef.current?.focus({ preventScroll: true });
    };
  }, [onClose]);

  const scarce = /limitata|1 disponibile/i.test(product.status);

  return (
    <div className="sheet-scrim" role="presentation" onMouseDown={onClose}>
      <div
        className="product-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-sheet-title"
        ref={sheetRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button ref={closeRef} type="button" className="sheet-close" onClick={onClose} aria-label="Chiudi la scheda">
          ×
        </button>

        <div className="sheet-photo" style={{ "--product-color": product.color, "--product-reaction": product.reaction } as CSSProperties}>
          {product.image ? (
            <Image src={product.image} alt={`${product.name}, ${product.kind}`} fill sizes="(max-width: 900px) 92vw, 46vw" priority />
          ) : (
            <span className="sheet-photo-plate" aria-hidden="true" />
          )}
          <span className="piece-index" aria-hidden="true">{String(position).padStart(2, "0")}</span>
          <span className="craft-pill">Fatto a mano</span>
        </div>

        <div className="sheet-copy">
          <span className="section-kicker">Scheda pezzo · Drop 01 / 2026</span>
          <div className="sheet-title-row">
            <h2 id="product-sheet-title">{product.name}</h2>
            <span className="sheet-price">{money(product.price)}</span>
          </div>
          <p className="sheet-lead">
            {product.kind} dipinta a mano con acrilico. Parte da un disegno e finisce diversa da ogni altra:
            nessuna stampa, nessun reprint, nessuna copia identica.
          </p>

          <dl className="sheet-specs">
            <div><dt>Codice</dt><dd>{product.id}</dd></div>
            <div><dt>Tecnica</dt><dd>{product.technique ?? "Acrilico a mano"}</dd></div>
            <div><dt>Lavorazione</dt><dd>7–14 giorni</dd></div>
            <div><dt>Disponibilità</dt><dd className={scarce ? "is-scarce" : undefined}>{product.status}</dd></div>
          </dl>

          <fieldset className="sheet-sizes">
            <legend>Scegli la taglia</legend>
            <div className="choice-pills">
              {CLOTHING_SIZES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={size === option ? "is-selected" : ""}
                  onClick={() => setSize(option)}
                  aria-pressed={size === option}
                >
                  {option}
                </button>
              ))}
            </div>
            <p className="field-helper">Vestibilità regolare. Se sei tra due taglie, prendi la più grande.</p>
          </fieldset>

          <button
            type="button"
            className="sheet-cta"
            disabled={!size}
            onClick={() => size && onAdd(product, size)}
          >
            <span>{size ? "Aggiungi al carrello" : "Scegli una taglia"}</span>
            <span className="card-action-arrow" aria-hidden="true">→</span>
          </button>

          <div className="sheet-foot">
            <span className="ticket-bars" aria-hidden="true">
              {Array.from({ length: 28 }).map((_, index) => <span key={index} />)}
            </span>
            <p>Spedizione tracciata · Reso entro 14 giorni sui capi non personalizzati</p>
          </div>
        </div>
      </div>
    </div>
  );
}
