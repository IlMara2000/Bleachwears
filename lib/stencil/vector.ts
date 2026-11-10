import { cartoonLevels, structureLines } from "./local-core";
import { keepLinear, settleBinary, smoothPolygon, tracePolygons } from "./vector-core";

/** Cartoon inks, dark to light. Black is the page. */
export const CARTOON_INKS = ["#b2b2b2", "#e6e6e6", "#fcfcfc"] as const;

/**
 * Paints the whole cartoon poster: black page, then one flat ink per tone with
 * a black outline, all from smoothed vector loops. Nothing here touches the
 * photo's grain, so no speckle survives.
 */
export function renderCartoon(
  context: CanvasRenderingContext2D,
  rgba: Uint8ClampedArray,
  coverage: Float32Array,
  width: number,
  height: number,
): void {
  const levels = cartoonLevels(rgba, coverage, width, height);
  const minArea = Math.max(40, Math.round(width * height * 0.00005));
  const outline = Math.max(1, Math.min(4, Math.round(Math.min(width, height) / 500)));

  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);

  /* Tracing on half the grid drops one-pixel zigzags before they reach a curve. */
  const step = 2;
  const traceWidth = Math.ceil(width / step);
  const traceHeight = Math.ceil(height / step);

  for (let level = 0; level < CARTOON_INKS.length; level += 1) {    const votes = new Uint8Array(traceWidth * traceHeight);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (levels[index] === level && coverage[index] > 0.5) {
          votes[Math.floor(y / step) * traceWidth + Math.floor(x / step)] += 1;
        }
      }
    }

    const binary = new Uint8Array(votes.length);
    for (let index = 0; index < votes.length; index += 1) binary[index] = votes[index] >= 2 ? 1 : 0;
    const clean = settleBinary(binary, traceWidth, traceHeight, 1);

    /*
     * Shading planes are large; specks are not. The dark tone keeps the small
     * budget because that is where eyes and nostrils live, while grey islands
     * under a clothes fold have to be big enough to be a decision.
     */
    const levelMinArea = level === 0 ? minArea : Math.round(minArea * 3);
    const loops = tracePolygons(clean, traceWidth, traceHeight, levelMinArea / (step * step)).map(
      (loop) => {
        const scaled = loop.map((value) => value * step);
        return smoothPolygon(scaled, 3);
      },
    );
    paintPolygons(context, loops, CARTOON_INKS[level], "#000000", outline);
  }

  /*
   * The drawn features last, so they sit on top of every flat shape. Lines are
   * only inked over the light tones: inside an area that is already shadow a
   * line adds nothing, and that is exactly where beard or hair texture would
   * turn the face into confetti.
   */
  const raw = structureLines(rgba, coverage, width, height);
  const linear = keepLinear(raw, width, height, Math.max(60, Math.round(width * height * 0.0004)));
  const features = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    /* Inside shadow a line adds nothing, and that is where texture lives. */
    features[index] = linear[index] === 1 && levels[index] !== 0 ? 1 : 0;
  }

  const featureVotes = new Uint8Array(traceWidth * traceHeight);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (features[y * width + x] === 1) {
        featureVotes[Math.floor(y / step) * traceWidth + Math.floor(x / step)] += 1;
      }
    }
  }
  const featureBinary = new Uint8Array(featureVotes.length);
  for (let index = 0; index < featureVotes.length; index += 1) {
    featureBinary[index] = featureVotes[index] >= 1 ? 1 : 0;
  }
  const featureClean = settleBinary(featureBinary, traceWidth, traceHeight, 1);
  const strokes = tracePolygons(
    featureClean,
    traceWidth,
    traceHeight,
    Math.max(4, Math.round(minArea / (step * step) / 4)),
  ).map((loop) =>
    smoothPolygon(
      loop.map((value) => value * step),
      2,
    ),
  );
  paintPolygons(context, strokes, "#000000", null, 0);
}

/** Fills the loops with one flat ink and inks their outline. */
export function paintPolygons(
  context: CanvasRenderingContext2D,
  polygons: number[][],
  fill: string,
  stroke: string | null,
  lineWidth: number,
): void {
  if (polygons.length === 0) return;
  const path = new Path2D();
  for (const loop of polygons) {
    path.moveTo(loop[0], loop[1]);
    for (let index = 2; index < loop.length; index += 2) path.lineTo(loop[index], loop[index + 1]);
    path.closePath();
  }
  context.fillStyle = fill;
  context.fill(path, "evenodd");
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = lineWidth;
    context.lineJoin = "round";
    context.stroke(path);
  }
}
