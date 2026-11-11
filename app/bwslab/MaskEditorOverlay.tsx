"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./stencil.module.css";

const cx = (...values: Array<string | false | undefined>) => values.filter(Boolean).join(" ");

type Props = {
  source: { url: string; width: number; height: number };
  mask: Uint8Array;
  maskSize: { width: number; height: number };
  brush: number;
  editMode: "paint" | "erase";
  onBrush: (value: number) => void;
  onMode: (mode: "paint" | "erase") => void;
  onMask: (mask: Uint8Array) => void;
  onClose: () => void;
};

type Fit = { x: number; y: number; scale: number; width: number; height: number };

/** One round dab of the brush, written straight into the mask grid. */
function stamp(
  data: Uint8Array,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
  value: 0 | 1,
) {
  const minX = Math.max(0, Math.floor(centerX - radius));
  const maxX = Math.min(width - 1, Math.ceil(centerX + radius));
  const minY = Math.max(0, Math.floor(centerY - radius));
  const maxY = Math.min(height - 1, Math.ceil(centerY + radius));
  const squared = radius * radius;

  for (let y = minY; y <= maxY; y += 1) {
    const dy = y - centerY;
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - centerX;
      if (dx * dx + dy * dy > squared) continue;
      data[y * width + x] = value;
    }
  }
}

/**
 * Full-screen editor: the photo with the cut mask overlaid, a brush that adds
 * the subject back and an eraser that takes an object out. Strokes land on the
 * mask the engine prints from, so what is painted here is what gets inked.
 */
export default function MaskEditorOverlay({
  source,
  mask,
  maskSize,
  brush,
  editMode,
  onBrush,
  onMode,
  onMask,
  onClose,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<Uint8Array | null>(null);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const paintingRef = useRef(false);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const picture = new Image();
    let alive = true;
    picture.onload = () => {
      if (alive) setImage(picture);
    };
    picture.src = source.url;
    return () => {
      alive = false;
    };
  }, [source.url]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => setBox({ width: wrap.clientWidth, height: wrap.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /* Contain the photo in the viewport: a stretched canvas would send every
     stroke somewhere other than where the pointer is. */
  const fit = useMemo<Fit | null>(() => {
    if (!box.width || !box.height) return null;
    const scale = Math.min(box.width / source.width, box.height / source.height);
    const width = source.width * scale;
    const height = source.height * scale;
    return {
      x: Math.round((box.width - width) / 2),
      y: Math.round((box.height - height) / 2),
      scale,
      width,
      height,
    };
  }, [box, source.width, source.height]);

  /* The engine's mask grid and the photo grid differ on large photos. */
  const maskPerImage = source.width / maskSize.width;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fit || !box.width || !box.height) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    canvas.style.width = `${box.width}px`;
    canvas.style.height = `${box.height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = "#0b0b0e";
    context.fillRect(0, 0, box.width, box.height);
    if (image) context.drawImage(image, fit.x, fit.y, fit.width, fit.height);

    /* One ImageData pass instead of a fillRect per pixel: the old version
       painted six hundred thousand rectangles on every mouse move. */
    const data = liveRef.current ?? mask;
    const overlay = document.createElement("canvas");
    overlay.width = maskSize.width;
    overlay.height = maskSize.height;
    const overlayContext = overlay.getContext("2d");
    if (!overlayContext) return;

    const pixels = overlayContext.createImageData(maskSize.width, maskSize.height);
    for (let index = 0; index < data.length; index += 1) {
      const offset = index * 4;
      const keep = data[index] === 1;
      pixels.data[offset] = keep ? 244 : 0;
      pixels.data[offset + 1] = keep ? 241 : 0;
      pixels.data[offset + 2] = keep ? 234 : 0;
      pixels.data[offset + 3] = keep ? 92 : 172;
    }
    overlayContext.putImageData(pixels, 0, 0);
    context.imageSmoothingEnabled = true;
    context.drawImage(overlay, fit.x, fit.y, fit.width, fit.height);
  }, [box, fit, image, mask, maskSize.height, maskSize.width]);

  useEffect(() => {
    draw();
  }, [draw]);

  const toMaskPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !fit) return null;
      const rect = canvas.getBoundingClientRect();
      const imageX = (clientX - rect.left - fit.x) / fit.scale;
      const imageY = (clientY - rect.top - fit.y) / fit.scale;
      return { x: imageX / maskPerImage, y: imageY / maskPerImage };
    },
    [fit, maskPerImage],
  );

  const stroke = useCallback(
    (clientX: number, clientY: number) => {
      const point = toMaskPoint(clientX, clientY);
      if (!point) return;
      if (!liveRef.current) liveRef.current = new Uint8Array(mask);

      const data = liveRef.current;
      const value: 0 | 1 = editMode === "paint" ? 1 : 0;
      const radius = Math.max(1, brush);
      const from = lastRef.current ?? point;
      const distance = Math.hypot(point.x - from.x, point.y - from.y);
      /* Dabs along the segment: a fast drag must not leave a dotted line. */
      const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.5)));
      for (let step = 1; step <= steps; step += 1) {
        const ratio = step / steps;
        stamp(
          data,
          maskSize.width,
          maskSize.height,
          from.x + (point.x - from.x) * ratio,
          from.y + (point.y - from.y) * ratio,
          radius,
          value,
        );
      }
      lastRef.current = point;
      draw();
    },
    [brush, draw, editMode, mask, maskSize.height, maskSize.width, toMaskPoint],
  );

  const commit = useCallback(() => {
    paintingRef.current = false;
    lastRef.current = null;
    const data = liveRef.current;
    liveRef.current = null;
    if (data) onMask(data);
  }, [onMask]);

  const cursor = Math.max(3, brush * maskPerImage * (fit?.scale ?? 1));

  return (
    <div className={cx(styles.overlay, "fixed inset-0 z-50 flex flex-col")}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sl-hairline)] px-5 py-4">
        <div>
          <p className={cx(styles.micro, "tracking-[0.32em]")}>Correzione manuale</p>
          <p className={cx(styles.measure, "mt-1")}>
            Pennello {Math.round(brush)} px · {editMode === "paint" ? "Aggiungi soggetto" : "Togli oggetto"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={cx(styles.btn, editMode === "paint" && styles.btnPrimary)}
            onClick={() => onMode("paint")}
          >
            Aggiungi
          </button>
          <button
            type="button"
            className={cx(styles.btn, editMode === "erase" && styles.btnPrimary)}
            onClick={() => onMode("erase")}
          >
            Cancella
          </button>
          <button
            type="button"
            className={cx(styles.btn, "min-h-0 px-3")}
            aria-label="Pennello più piccolo"
            onClick={() => onBrush(Math.max(2, brush - 2))}
          >
            −
          </button>
          <button
            type="button"
            className={cx(styles.btn, "min-h-0 px-3")}
            aria-label="Pennello più grande"
            onClick={() => onBrush(Math.min(80, brush + 2))}
          >
            +
          </button>
          <button type="button" className={cx(styles.btn, styles.btnGhost)} onClick={onClose}>
            Chiudi
          </button>
        </div>
      </div>

      <div ref={wrapRef} className="relative flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 touch-none"
          style={{ cursor: "none" }}
          onPointerDown={(event) => {
            event.preventDefault();
            /* Capture keeps the stroke alive past the edge; a synthetic event
               has no active pointer, and that must not abort the stroke. */
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              /* no active pointer to capture */
            }
            paintingRef.current = true;
            lastRef.current = null;
            stroke(event.clientX, event.clientY);
          }}
          onPointerMove={(event) => {
            setHover({ x: event.clientX, y: event.clientY });
            if (paintingRef.current) stroke(event.clientX, event.clientY);
          }}
          onPointerUp={commit}
          onPointerCancel={commit}
          onPointerLeave={() => setHover(null)}
        />
        {hover ? (
          <div
            className={cx(
              styles.brushCursor,
              "pointer-events-none fixed rounded-full border border-[var(--sl-paper)]",
            )}
            style={{ left: hover.x - cursor, top: hover.y - cursor, width: cursor * 2, height: cursor * 2 }}
          />
        ) : null}
      </div>

      <div className="border-t border-[var(--sl-hairline)] px-5 py-3">
        <p className={cx(styles.micro, "leading-relaxed")}>
          Trascina sulla foto. Chiaro: soggetto che entra nello stencil. Scuro: sfondo che resta fuori.
        </p>
      </div>
    </div>
  );
}
