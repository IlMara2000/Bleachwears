"use client";

import type { ImageSegmenter } from "@mediapipe/tasks-vision";

import {
  backgroundLabel,
  despeckle,
  dropSmallIslands,
  fillHoles,
  stylize,
  subjectMask,
  upsampleCoverage,
} from "./local-core";

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

export type LocalStencil = { blob: Blob; width: number; height: number };

function sizeOf(source: ImageBitmap | HTMLImageElement) {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

export async function renderStencil(source: ImageBitmap | HTMLImageElement): Promise<LocalStencil> {
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
  const frame = context.getImageData(0, 0, width, height);

  const model = await segmenter();
  const result = model.segment(canvas);
  const categoryMask = result.categoryMask;
  if (!categoryMask) throw new Error("La segmentazione non ha restituito una maschera.");

  const labels = categoryMask.getAsUint8Array();
  const maskWidth = categoryMask.width;
  const maskHeight = categoryMask.height;
  categoryMask.close();

  const background = backgroundLabel(labels, maskWidth, maskHeight);
  let mask = subjectMask(labels, maskWidth, maskHeight, background);
  mask = despeckle(mask, 2);
  mask = dropSmallIslands(mask, 0.12);
  mask = fillHoles(mask);

  let subject = 0;
  for (let index = 0; index < mask.data.length; index += 1) subject += mask.data[index];
  const share = subject / mask.data.length;
  if (share < 0.005 || share > 0.95) {
    throw new Error(
      "Non distinguo il soggetto dallo sfondo in questa foto. Prova un'immagine con il soggetto più staccato e centrato.",
    );
  }

  const coverage = upsampleCoverage(mask, width, height);
  const pixels = stylize(frame.data, coverage, width, height, { hatch: true });
  const buffer = new Uint8ClampedArray(new ArrayBuffer(pixels.length));
  buffer.set(pixels);
  context.putImageData(new ImageData(buffer, width, height), 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("Non riesco a codificare il PNG."))),
      "image/png",
    );
  });

  return { blob, width, height };
}
