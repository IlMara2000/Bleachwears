"use client";

import type { ImageSegmenter } from "@mediapipe/tasks-vision";

import {
  backgroundLabel,
  centerLabel,
  despeckle,
  fillHoles,
  hardenCoverage,
  keepCenterComponent,
  labelMask,
  luminanceOf,
  pruneDistantIslands,
  refineCoverage,
  stylize,
  subjectMask,
  type Mask,
  downsampleMask,
  upsampleCoverage,
  upsampleMask,
} from "./local-core";

/**
 * The two looks the local engine offers. `flat` stays internal to the core.
 */
export type StencilStyle = "cartoon" | "engrave";
import { renderCartoon } from "./vector";

/**
 * The keyless engine: a small segmentation model runs inside the browser, so a
 * photo never leaves the device and the studio keeps working with no account,
 * no key and no bill. Model and runtime come from public CDNs.
 */
const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/latest/deeplab_v3.tflite";

export const LOCAL_ENGINE_LABEL = "deeplab-v3";

/** Big enough for a crisp poster, small enough to stay instant in the tab. */
const MAX_EDGE = 1600;

let segmenterPromise: Promise<ImageSegmenter> | null = null;

function createSegmenter(): Promise<ImageSegmenter> {
  return (async () => {
    const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    const options = {
      baseOptions: { modelAssetPath: MODEL_URL },
      runningMode: "IMAGE" as const,
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    };

    try {
      return await ImageSegmenter.createFromOptions(fileset, {
        ...options,
        baseOptions: { ...options.baseOptions, delegate: "GPU" },
      });
    } catch {
      /* Older laptops lose WebGL often enough that CPU has to be the fallback. */
      return ImageSegmenter.createFromOptions(fileset, {
        ...options,
        baseOptions: { ...options.baseOptions, delegate: "CPU" },
      });
    }
  })();
}

export function preloadLocalEngine(): void {
  if (!segmenterPromise) {
    segmenterPromise = createSegmenter().catch((error) => {
      segmenterPromise = null;
      throw error;
    });
  }
  void segmenterPromise.catch(() => undefined);
}

function segmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = createSegmenter().catch((error) => {
      segmenterPromise = null;
      throw error;
    });
  }
  return segmenterPromise;
}

export type LocalStencil = {
  blob: Blob;
  width: number;
  height: number;
  mask?: Uint8Array;
  maskWidth?: number;
  maskHeight?: number;
};

/** A mask the user drew by hand, at whatever resolution the editor worked in. */
export type MaskOptions = { mask?: Uint8Array; maskWidth?: number; maskHeight?: number };

export const STENCIL_STYLES: Array<{ id: StencilStyle; label: string; note: string }> = [
  { id: "cartoon", label: "Cartoon", note: "Tinte piatte, contorni neri" },
  { id: "engrave", label: "Incisione", note: "Tratteggio incrociato" },
];

function sizeOf(source: ImageBitmap | HTMLImageElement) {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

/** The photo drawn at output resolution, ready for the model or the renderer. */
function frameOf(source: ImageBitmap | HTMLImageElement) {
  const { width: sourceWidth, height: sourceHeight } = sizeOf(source);
  if (!sourceWidth || !sourceHeight) throw new Error("Non riesco a leggere le dimensioni di questa immagine.");

  const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Questo browser non riesce a elaborare l'immagine.");

  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
  return { canvas, context, width, height };
}

/**
 * The subject cut at output resolution: either the strokes the user drew by
 * hand or the model's own read. Both paths live here so the editor preview and
 * the print can never disagree about what is inside the subject.
 */
async function resolveMask(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  options: MaskOptions,
): Promise<Mask> {
  if (options.mask && options.maskWidth && options.maskHeight) {
    /* A hand-edited mask may come in at any size: bring it to the output
       resolution so the guided filter and the renderer agree on every pixel.
       Nothing is despeckled or pruned here, or a one-pixel stroke would go. */
    const supplied: Mask = { data: options.mask, width: options.maskWidth, height: options.maskHeight };
    if (supplied.width === width && supplied.height === height) return supplied;
    if (supplied.width >= width && supplied.height >= height) return downsampleMask(supplied, width, height);
    return { data: upsampleMask(supplied, width, height), width, height };
  }

  const model = await segmenter();
  const result = model.segment(canvas);
  const categoryMask = result.categoryMask;
  if (!categoryMask) throw new Error("La segmentazione non ha restituito una maschera.");

  const labels = categoryMask.getAsUint8Array();
  const maskWidth = categoryMask.width;
  const maskHeight = categoryMask.height;
  categoryMask.close();

  /* What sits in the middle of the frame is the subject. Reading the outer ring
     instead inverts the cut whenever the subject runs off an edge: a shirt that
     fills the bottom border looks like backdrop and the person gets erased. */
  const focus = centerLabel(labels, maskWidth, maskHeight);
  const raw =
    focus > 0
      ? keepCenterComponent(labelMask(labels, maskWidth, maskHeight, focus))
      : subjectMask(labels, maskWidth, maskHeight, backgroundLabel(labels, maskWidth, maskHeight));

  return fillHoles(pruneDistantIslands(despeckle(raw, 2), 0.008), 0.02);
}

/**
 * The subject cut on its own, no ink: the editor needs a mask before the first
 * print, and this is the same read that print would have used.
 */
export async function segmentSubject(
  source: ImageBitmap | HTMLImageElement,
  options: MaskOptions = {},
): Promise<{ mask: Uint8Array; width: number; height: number }> {
  const { canvas, width, height } = frameOf(source);
  const mask = await resolveMask(canvas, width, height, options);
  return { mask: mask.data, width: mask.width, height: mask.height };
}

export async function renderStencil(
  source: ImageBitmap | HTMLImageElement,
  options: { style?: StencilStyle } & MaskOptions = {},
): Promise<LocalStencil> {
  const style = options.style ?? "cartoon";
  const { canvas, context, width, height } = frameOf(source);
  const frame = context.getImageData(0, 0, width, height);
  const mask = await resolveMask(canvas, width, height, options);

  let subject = 0;
  for (let index = 0; index < mask.data.length; index += 1) subject += mask.data[index];
  const share = subject / mask.data.length;
  if (share < 0.005) {
    throw new Error(
      options.mask
        ? "La maschera è vuota: dipingi il soggetto prima di stampare."
        : "Non distinguo il soggetto dallo sfondo in questa foto. Prova un'immagine con il soggetto più staccato e centrato.",
    );
  }
  if (!options.mask && share > 0.95) {
    throw new Error(
      "Non distinguo il soggetto dallo sfondo in questa foto. Prova un'immagine con il soggetto più staccato e centrato.",
    );
  }

  /* The model's 257 px grid is the reason a cut can look a few pixels off. */
  const guide = luminanceOf(frame.data);
  const radius = Math.min(10, Math.max(3, Math.round(Math.min(width, height) / 160)));
  const coverage = hardenCoverage(
    refineCoverage(guide, upsampleCoverage(mask, width, height), width, height, radius, 0.0025),
  );
  if (style === "engrave") {
    const pixels = stylize(frame.data, coverage, width, height, { mode: "engrave" });
    const buffer = new Uint8ClampedArray(new ArrayBuffer(pixels.length));
    buffer.set(pixels);
    context.putImageData(new ImageData(buffer, width, height), 0, 0);
  } else {
    renderCartoon(context, frame.data, coverage, width, height);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("Non riesco a codificare il PNG."))),
      "image/png",
    );
  });

  const outMask = new Uint8Array(coverage.length);
  for (let index = 0; index < coverage.length; index += 1) outMask[index] = coverage[index] > 0.5 ? 1 : 0;
  return { blob, width, height, mask: outMask, maskWidth: width, maskHeight: height };
}
