/**
 * Pixel maths for the keyless stencil engine. No DOM, no model, no network:
 * everything here is a plain array transform so the look can be unit tested.
 */

export type Mask = {
  /** 1 = subject, 0 = background. */
  data: Uint8Array;
  width: number;
  height: number;
};

/** Four flat inks, dark to light. The backdrop stays pure black. */
export const STENCIL_TONES = [14, 96, 186, 250] as const;

/** Upper bounds of the three darkest tones, in stretched luminance. */
const TONE_CUTS = [0.34, 0.56, 0.78] as const;

/**
 * The outer frame of a photo is background far more often than not. Using the
 * dominant label there beats hard-coding "person", so cars, dogs and buildings
 * work with the same model.
 */
export function backgroundLabel(labels: Uint8Array, width: number, height: number): number {
  const counts = new Uint32Array(256);
  const ring = Math.max(1, Math.round(Math.min(width, height) * 0.02));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const onRing = x < ring || y < ring || x >= width - ring || y >= height - ring;
      if (onRing) counts[labels[y * width + x]] += 1;
    }
  }

  let best = 0;
  let bestCount = -1;
  for (let label = 0; label < 256; label += 1) {
    if (counts[label] > bestCount) {
      bestCount = counts[label];
      best = label;
    }
  }
  return best;
}

export function subjectMask(labels: Uint8Array, width: number, height: number, background: number): Mask {
  const data = new Uint8Array(width * height);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = labels[index] === background ? 0 : 1;
  }
  return { data, width, height };
}

/** Majority vote over the 8 neighbours: one pass eats salt-and-pepper speckle. */
export function despeckle(mask: Mask, passes = 2): Mask {
  const { width, height } = mask;
  let source = mask.data;

  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Uint8Array(source.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let votes = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) {
            votes += 1;
            continue;
          }
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) {
              votes += 1;
              continue;
            }
            votes += source[ny * width + nx];
          }
        }
        next[y * width + x] = votes >= 5 ? 1 : 0;
      }
    }
    source = next;
  }

  return { data: source, width, height };
}

/**
 * Drops the islands the model guesses in the corners while keeping real parts
 * such as a second hand or a raised arm.
 */
export function dropSmallIslands(mask: Mask, keepRatio = 0.03): Mask {
  const { data, width, height } = mask;
  const visited = new Uint8Array(data.length);
  const stack = new Int32Array(data.length);
  const components: Array<{ pixels: number[]; area: number }> = [];

  for (let start = 0; start < data.length; start += 1) {
    if (data[start] === 0 || visited[start] === 1) continue;
    let top = 0;
    stack[top++] = start;
    visited[start] = 1;
    const pixels: number[] = [];

    while (top > 0) {
      const index = stack[--top];
      pixels.push(index);
      const x = index % width;
      const y = (index - x) / width;
      if (x > 0 && data[index - 1] === 1 && visited[index - 1] === 0) {
        visited[index - 1] = 1;
        stack[top++] = index - 1;
      }
      if (x < width - 1 && data[index + 1] === 1 && visited[index + 1] === 0) {
        visited[index + 1] = 1;
        stack[top++] = index + 1;
      }
      if (y > 0 && data[index - width] === 1 && visited[index - width] === 0) {
        visited[index - width] = 1;
        stack[top++] = index - width;
      }
      if (y < height - 1 && data[index + width] === 1 && visited[index + width] === 0) {
        visited[index + width] = 1;
        stack[top++] = index + width;
      }
    }

    components.push({ pixels, area: pixels.length });
  }

  if (components.length === 0) return mask;
  const biggest = Math.max(...components.map((component) => component.area));
  const floor = Math.max(24, Math.round(biggest * keepRatio));
  const out = new Uint8Array(data.length);
  for (const component of components) {
    if (component.area < floor) continue;
    for (const index of component.pixels) out[index] = 1;
  }

  return { data: out, width, height };
}

/**
 * Closes pinholes, but never the daylight between an arm and the body: only
 * holes smaller than `maxRatio` of the subject are filled.
 */
export function fillHoles(mask: Mask, maxRatio = 0.02): Mask {
  const { data, width, height } = mask;
  const reachable = new Uint8Array(data.length);
  const stack = new Int32Array(data.length);
  let top = 0;

  const push = (index: number) => {
    if (data[index] === 0 && reachable[index] === 0) {
      reachable[index] = 1;
      stack[top++] = index;
    }
  };

  for (let x = 0; x < width; x += 1) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    push(y * width);
    push(y * width + width - 1);
  }

  while (top > 0) {
    const index = stack[--top];
    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) push(index - 1);
    if (x < width - 1) push(index + 1);
    if (y > 0) push(index - width);
    if (y < height - 1) push(index + width);
  }

  /* Enclosed regions are collected first so the big ones can survive. */
  const visited = new Uint8Array(data.length);
  const out = new Uint8Array(data.length);
  for (let index = 0; index < data.length; index += 1) out[index] = data[index];

  let subject = 0;
  for (let index = 0; index < data.length; index += 1) subject += data[index];
  const limit = Math.max(16, Math.round(subject * maxRatio));

  for (let start = 0; start < data.length; start += 1) {
    if (data[start] === 1 || reachable[start] === 1 || visited[start] === 1) continue;
    let top = 0;
    stack[top++] = start;
    visited[start] = 1;
    const pixels: number[] = [];
    let touchesFrame = false;

    while (top > 0) {
      const index = stack[--top];
      pixels.push(index);
      const x = index % width;
      const y = (index - x) / width;
      const push = (next: number) => {
        if (data[next] === 1 || reachable[next] === 1 || visited[next] === 1) return;
        visited[next] = 1;
        stack[top++] = next;
      };
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesFrame = true;
      if (x > 0) push(index - 1);
      if (x < width - 1) push(index + 1);
      if (y > 0) push(index - width);
      if (y < height - 1) push(index + width);
    }

    if (touchesFrame || pixels.length > limit) continue;
    for (const index of pixels) out[index] = 1;
  }

  return { data: out, width, height };
}

/**
 * Keeps the subject and the parts that nearly touch it, and drops everything
 * else: a flag or a chair behind the model often survives the classifier as
 * "subject", and a poster with a stray chunk of background looks badly cut.
 */
export function pruneDistantIslands(mask: Mask, gapRatio = 0.008): Mask {
  const { data, width, height } = mask;
  const visited = new Uint8Array(data.length);
  const stack = new Int32Array(data.length);
  const components: number[][] = [];

  for (let start = 0; start < data.length; start += 1) {
    if (data[start] === 0 || visited[start] === 1) continue;
    let top = 0;
    stack[top++] = start;
    visited[start] = 1;
    const pixels: number[] = [];
    while (top > 0) {
      const index = stack[--top];
      pixels.push(index);
      const x = index % width;
      const y = (index - x) / width;
      const push = (next: number) => {
        if (data[next] === 1 && visited[next] === 0) {
          visited[next] = 1;
          stack[top++] = next;
        }
      };
      if (x > 0) push(index - 1);
      if (x < width - 1) push(index + 1);
      if (y > 0) push(index - width);
      if (y < height - 1) push(index + width);
    }
    components.push(pixels);
  }

  if (components.length <= 1) return mask;
  components.sort((a, b) => b.length - a.length);

  /* Flood outwards from the main body: anything it reaches stays. */
  const near = new Uint8Array(data.length);
  let frontier = components[0];
  for (const index of frontier) near[index] = 1;
  const gap = Math.max(1, Math.round(Math.max(width, height) * gapRatio));

  for (let step = 0; step < gap; step += 1) {
    const next: number[] = [];
    for (const index of frontier) {
      const x = index % width;
      const y = (index - x) / width;
      const push = (cursor: number) => {
        if (near[cursor] === 1) return;
        near[cursor] = 1;
        next.push(cursor);
      };
      if (x > 0) push(index - 1);
      if (x < width - 1) push(index + 1);
      if (y > 0) push(index - width);
      if (y < height - 1) push(index + width);
    }
    frontier = next;
    if (frontier.length === 0) break;
  }

  const out = new Uint8Array(data.length);
  for (const pixels of components) {
    let touches = false;
    for (const index of pixels) {
      if (near[index] === 1) {
        touches = true;
        break;
      }
    }
    if (!touches) continue;
    for (const index of pixels) out[index] = 1;
  }

  return { data: out, width, height };
}

/** Luminance in 0..1, the guide the edge refinement snaps to. */
export function luminanceOf(rgba: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(rgba.length / 4);
  for (let index = 0; index < out.length; index += 1) {
    const offset = index * 4;
    out[index] =
      (0.2126 * rgba[offset] + 0.7152 * rgba[offset + 1] + 0.0722 * rgba[offset + 2]) / 255;
  }
  return out;
}

/** Box blur over the whole frame, ignoring the mask: the guided filter needs it. */
function boxBlur(source: Float32Array, width: number, height: number, radius: number): Float32Array {
  const horizontal = new Float32Array(source.length);
  const out = new Float32Array(source.length);
  const r = Math.max(1, Math.round(radius));

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;
    let count = 0;
    for (let x = 0; x <= Math.min(width - 1, r); x += 1) {
      sum += source[row + x];
      count += 1;
    }
    for (let x = 0; x < width; x += 1) {
      horizontal[row + x] = sum / count;
      const drop = x - r;
      const add = x + r + 1;
      if (drop >= 0) {
        sum -= source[row + drop];
        count -= 1;
      }
      if (add < width) {
        sum += source[row + add];
        count += 1;
      }
    }
  }

  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    let count = 0;
    for (let y = 0; y <= Math.min(height - 1, r); y += 1) {
      sum += horizontal[y * width + x];
      count += 1;
    }
    for (let y = 0; y < height; y += 1) {
      out[y * width + x] = sum / count;
      const drop = y - r;
      const add = y + r + 1;
      if (drop >= 0) {
        sum -= horizontal[drop * width + x];
        count -= 1;
      }
      if (add < height) {
        sum += horizontal[add * width + x];
        count += 1;
      }
    }
  }

  return out;
}

/**
 * Guided filter. The segmentation model answers on a 257 px grid, so its edge
 * sits a handful of pixels off; this pulls the mask onto the real edge of the
 * photo, and keeps a thin antialiased ramp instead of a stair-step.
 */
export function refineCoverage(
  guide: Float32Array,
  coarse: Float32Array,
  width: number,
  height: number,
  radius: number,
  epsilon: number,
): Float32Array {
  const meanGuide = boxBlur(guide, width, height, radius);
  const meanMask = boxBlur(coarse, width, height, radius);

  const squaredGuide = new Float32Array(guide.length);
  const product = new Float32Array(guide.length);
  for (let index = 0; index < guide.length; index += 1) {
    squaredGuide[index] = guide[index] * guide[index];
    product[index] = guide[index] * coarse[index];
  }

  const meanSquared = boxBlur(squaredGuide, width, height, radius);
  const meanProduct = boxBlur(product, width, height, radius);

  const slope = new Float32Array(guide.length);
  const offset = new Float32Array(guide.length);
  for (let index = 0; index < guide.length; index += 1) {
    const variance = meanSquared[index] - meanGuide[index] * meanGuide[index];
    const covariance = meanProduct[index] - meanGuide[index] * meanMask[index];
    const a = covariance / (variance + epsilon);
    slope[index] = a;
    offset[index] = meanMask[index] - a * meanGuide[index];
  }

  const meanSlope = boxBlur(slope, width, height, radius);
  const meanOffset = boxBlur(offset, width, height, radius);
  const out = new Float32Array(guide.length);
  for (let index = 0; index < guide.length; index += 1) {
    const value = meanSlope[index] * guide[index] + meanOffset[index];
    out[index] = Math.min(1, Math.max(0, value));
  }
  return out;
}

/**
 * A guided filter leaves a soft ramp as wide as its radius; printed stencils
 * do not. This squeezes that ramp into a two pixel edge so the cut looks
 * deliberate instead of blurry.
 */
export function hardenCoverage(coverage: Float32Array, low = 0.42, high = 0.62): Float32Array {
  const out = new Float32Array(coverage.length);
  const span = Math.max(1e-4, high - low);
  for (let index = 0; index < coverage.length; index += 1) {
    const value = (coverage[index] - low) / span;
    out[index] = Math.min(1, Math.max(0, value));
  }
  return out;
}

/**
 * Bilinear coverage at the output size. Sampling the coarse mask smoothly
 * instead of on its own grid is what removes the stair-step silhouette.
 */
export function upsampleCoverage(mask: Mask, width: number, height: number): Float32Array {
  const coverage = new Float32Array(width * height);
  const scaleX = mask.width / width;
  const scaleY = mask.height / height;

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(mask.height - 1, Math.max(0, (y + 0.5) * scaleY - 0.5));
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(mask.height - 1, y0 + 1);
    const fy = sourceY - y0;

    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(mask.width - 1, Math.max(0, (x + 0.5) * scaleX - 0.5));
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(mask.width - 1, x0 + 1);
      const fx = sourceX - x0;

      const top = mask.data[y0 * mask.width + x0] * (1 - fx) + mask.data[y0 * mask.width + x1] * fx;
      const bottom = mask.data[y1 * mask.width + x0] * (1 - fx) + mask.data[y1 * mask.width + x1] * fx;
      coverage[y * width + x] = top * (1 - fy) + bottom * fy;
    }
  }

  return coverage;
}

/** Majority filter over the tone map, votes only from pixels inside the mask. */
function settleTones(
  tones: Uint8Array,
  coverage: Float32Array,
  width: number,
  height: number,
  passes: number,
): Uint8Array {
  let current = tones;

  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Uint8Array(current.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (coverage[index] <= 0.5) {
          next[index] = current[index];
          continue;
        }

        const votes = [0, 0, 0, 0];
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const cursor = ny * width + nx;
            if (coverage[cursor] <= 0.5) continue;
            votes[current[cursor]] += 1;
          }
        }

        let best = current[index];
        let bestVotes = -1;
        for (let tone = 0; tone < votes.length; tone += 1) {
          if (votes[tone] > bestVotes) {
            bestVotes = votes[tone];
            best = tone;
          }
        }
        next[index] = best;
      }
    }
    current = next;
  }

  return current;
}

function percentile(sorted: number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)));
  return sorted[index];
}

/** Sorted subject values, thinned to a budget so sorting stays cheap. */
function subjectSamples(values: Float32Array, coverage: Float32Array): number[] {
  let covered = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (coverage[index] > 0.5) covered += 1;
  }
  const stride = Math.max(1, Math.ceil(covered / 8000));
  const samples: number[] = [];
  for (let index = 0; index < values.length; index += 1) {
    if (coverage[index] > 0.5 && index % stride === 0) samples.push(values[index]);
  }
  samples.sort((a, b) => a - b);
  return samples;
}

/** Subject percentiles, so the ink range follows the face and not the sky. */
function stretch(values: Float32Array, coverage: Float32Array): { low: number; span: number } {
  const samples = subjectSamples(values, coverage);
  const low = percentile(samples, 0.02);
  const high = Math.max(low + 0.05, percentile(samples, 0.98));
  return { low, span: high - low };
}

/**
 * One engraved line set: a comb of strokes at a given angle, where the stroke
 * width grows with the ink demand. Width, not spacing, is what keeps the dark
 * areas from turning into a checkerboard.
 */
function hatchLine(along: number, spacing: number, width: number): number {
  if (width <= 0) return 0;
  const phase = along - Math.floor(along / spacing) * spacing;
  const edge = Math.min(phase, spacing - phase);
  return Math.min(1, Math.max(0, width + 0.5 - edge));
}

/**
 * Structure lines: the eyes, the mouth, the edge of a hat. Tone alone cannot
 * draw a face at this size, so a Sobel pass inks where contrast jumps.
 */
function structureInk(
  smoothed: Float32Array,
  coverage: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const magnitude = new Float32Array(smoothed.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (coverage[index] <= 0.5) continue;
      const left = x > 0 ? smoothed[index - 1] : smoothed[index];
      const right = x < width - 1 ? smoothed[index + 1] : smoothed[index];
      const up = y > 0 ? smoothed[index - width] : smoothed[index];
      const down = y < height - 1 ? smoothed[index + width] : smoothed[index];
      magnitude[index] = Math.abs(right - left) + Math.abs(down - up);
    }
  }

  /* Smoothing the response keeps skin texture out and real features in. */
  const soft = boxBlur(magnitude, width, height, 2);

  const samples: number[] = [];
  for (let index = 0; index < soft.length; index += 1) {
    if (coverage[index] > 0.5 && soft[index] > 0) samples.push(soft[index]);
  }
  samples.sort((a, b) => a - b);
  /* Relative to this face: a dark suit and a pale face need different scales. */
  const threshold = Math.max(0.04, percentile(samples, 0.955));

  const ink = new Float32Array(smoothed.length);
  for (let index = 0; index < ink.length; index += 1) {
    if (coverage[index] <= 0.5) continue;
    /* A steep ramp: a feature is either drawn or it is not. */
    ink[index] = Math.min(1, Math.max(0, (soft[index] - threshold) / (threshold * 0.7)));
  }
  return ink;
}

/**
 * Turns the photo into an engraving inside the mask, pure black outside:
 * paper white base, shadows built from crossing line sets, solid black only in
 * the deepest cores. `hatch: false` keeps the old four flat inks.
 */
export type StencilMode = "cartoon" | "engrave" | "flat";

/** Cartoon inks: a light base, a shadow, a highlight. Black is the page. */
const CARTOON_INKS = [176, 228, 252] as const;

/**
 * A cartoon line is a line: isolated specks of texture are not. Anything
 * smaller than this many pixels is thrown away before inking.
 */
function dropLineDots(
  binary: Uint8Array,
  width: number,
  height: number,
  minArea: number,
): Uint8Array {
  const visited = new Uint8Array(binary.length);
  const stack = new Int32Array(binary.length);
  const keep = new Uint8Array(binary.length);

  for (let start = 0; start < binary.length; start += 1) {
    if (binary[start] === 0 || visited[start] === 1) continue;
    let top = 0;
    stack[top++] = start;
    visited[start] = 1;
    const pixels: number[] = [];

    while (top > 0) {
      const index = stack[--top];
      pixels.push(index);
      const x = index % width;
      const y = (index - x) / width;
      const push = (next: number) => {
        if (binary[next] === 1 && visited[next] === 0) {
          visited[next] = 1;
          stack[top++] = next;
        }
      };
      if (x > 0) push(index - 1);
      if (x < width - 1) push(index + 1);
      if (y > 0) push(index - width);
      if (y < height - 1) push(index + width);
    }

    if (pixels.length < minArea) continue;
    for (const index of pixels) keep[index] = 1;
  }

  return keep;
}

/**
 * The drawn features as a binary map: eyes, mouth, nostrils, the line of a
 * hat brim. Speckle is dropped, so only real strokes survive.
 */
export function structureLines(
  rgba: Uint8ClampedArray,
  coverage: Float32Array,
  width: number,
  height: number,
): Uint8Array {
  const luminance = luminanceOf(rgba);
  const ink = structureInk(boxBlur(luminance, width, height, 1), coverage, width, height);
  const binary = new Uint8Array(ink.length);
  for (let index = 0; index < ink.length; index += 1) binary[index] = ink[index] > 0.45 ? 1 : 0;
  return dropLineDots(binary, width, height, Math.max(24, Math.round(width * height * 0.00008)));
}

/**
 * Coarse skin map from chroma alone. Chroma and not brightness, so pale and
 * deep skin both pass while grey cloth and most hair do not.
 */
function skinMask(
  rgba: Uint8ClampedArray,
  coverage: Float32Array,
  width: number,
  height: number,
): Uint8Array {
  const skin = new Uint8Array(coverage.length);
  for (let index = 0; index < coverage.length; index += 1) {
    if (coverage[index] <= 0.5) continue;
    const offset = index * 4;
    const r = rgba[offset];
    const g = rgba[offset + 1];
    const b = rgba[offset + 2];
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    if (cb >= 74 && cb <= 132 && cr >= 128 && cr <= 178) skin[index] = 1;
  }
  /* Stubble and knitwear tick the same boxes: keep only face-sized areas. */
  return dropLineDots(skin, width, height, Math.max(400, Math.round(width * height * 0.002)));
}

/** Tone split for the cartoon look, shared by the pixel and vector renderers. */
function levelsFromLuminance(
  smooth: Float32Array,
  coverage: Float32Array,
  width: number,
  height: number,
  rgba?: Uint8ClampedArray,
): Uint8Array {
  const raw = new Uint8Array(smooth.length);

  /*
   * Skin is split against itself, not against the whole silhouette: that is
   * what makes every face land on the light inks with a shading plane, whether
   * the photo is a pale face on a white shirt or a deep tone in a dark suit.
   */
  const skin = rgba ? skinMask(rgba, coverage, width, height) : null;
  const skinSamples: number[] = [];
  let skinCount = 0;
  let coveredCount = 0;
  if (skin) {
    for (let index = 0; index < smooth.length; index += 1) {
      if (coverage[index] <= 0.5) continue;
      coveredCount += 1;
      if (skin[index] === 1) {
        skinCount += 1;
        skinSamples.push(smooth[index]);
      }
    }
    skinSamples.sort((a, b) => a - b);
  }
  const hasSkin = coveredCount > 0 && skinCount / coveredCount > 0.05;
  /*
   * Relative to the middle of the face, not to percentiles of it: a percentile
   * always cuts somewhere, so an evenly lit face was split into blotches. With
   * a margin off the median, an even face stays one clean ink and only a real
   * shadow plane or a deep crease gets its own tone.
   */
  const skinMiddle = hasSkin ? percentile(skinSamples, 0.5) : 0;
  const skinDeep = skinMiddle * 0.68;
  const skinLit = skinMiddle * 0.88;

  /*
   * Everything else is split by population, not brightness: only the darkest
   * 18% becomes shadow and the brightest 14% highlight, so a white shirt never
   * eats a whole level.
   */
  const samples = subjectSamples(smooth, coverage);
  const shadowEdge = percentile(samples, 0.18);
  const lightEdge = percentile(samples, 0.86);
  for (let index = 0; index < raw.length; index += 1) {
    const value = smooth[index];
    if (skin && skin[index] === 1 && hasSkin) {
      raw[index] = value < skinDeep ? 0 : value < skinLit ? 1 : 2;
    } else {
      raw[index] = value < shadowEdge ? 0 : value < lightEdge ? 1 : 2;
    }
  }
  /* A majority vote keeps flat areas flat: no speckle, no dots. */
  return settleTones(raw, coverage, width, height, 3);
}

/**
 * The cartoon tone map on its own, for the vector renderer: 0 shadow,
 * 1 base, 2 highlight.
 */
export function cartoonLevels(
  rgba: Uint8ClampedArray,
  coverage: Float32Array,
  width: number,
  height: number,
): Uint8Array {
  const luminance = luminanceOf(rgba);
  const radius = Math.min(10, Math.max(3, Math.round(Math.min(width, height) / 150)));
  return levelsFromLuminance(boxBlur(luminance, width, height, radius), coverage, width, height, rgba);
}

/**
 * Turns the photo into a print inside the mask, pure black outside.
 *
 * `cartoon` (default) is flat: three clean inks and black keylines, the look of
 * a vector portrait. `flat` keeps the old four-ink poster, `engrave` the
 * hatched version.
 */
export function stylize(
  rgba: Uint8ClampedArray,
  coverage: Float32Array,
  width: number,
  height: number,
  options: { mode?: StencilMode } = {},
): Uint8ClampedArray {
  const mode = options.mode ?? "cartoon";
  const luminance = luminanceOf(rgba);

  /* Cartoon needs clean shapes, so it earns the wider blur. */
  const radius =
    mode === "engrave"
      ? Math.min(3, Math.max(1, Math.round(Math.min(width, height) / 500)))
      : Math.min(10, Math.max(3, Math.round(Math.min(width, height) / 150)));
  const smooth = boxBlur(luminance, width, height, radius);
  const { low, span } = stretch(smooth, coverage);

  const shade = new Float32Array(smooth.length);
  for (let index = 0; index < smooth.length; index += 1) {
    shade[index] = Math.min(1, Math.max(0, (smooth[index] - low) / span));
  }

  let levels: Uint8Array | null = null;
  if (mode !== "engrave") {
    const raw = new Uint8Array(shade.length);
    if (mode === "flat") {
      for (let index = 0; index < shade.length; index += 1) {
        let level: number = TONE_CUTS.length;
        for (let step = 0; step < TONE_CUTS.length; step += 1) {
          if (shade[index] < TONE_CUTS[step]) {
            level = step;
            break;
          }
        }
        raw[index] = level;
      }
      levels = settleTones(raw, coverage, width, height, 2);
    } else {
      levels = levelsFromLuminance(smooth, coverage, width, height, rgba);
    }
  }

  /* One pass of structure lines: eyes, mouth, nostrils, the brim of a hat. */
  let lines = structureInk(boxBlur(luminance, width, height, 1), coverage, width, height);
  if (mode === "cartoon") {
    const binary = new Uint8Array(lines.length);
    for (let index = 0; index < lines.length; index += 1) binary[index] = lines[index] > 0.45 ? 1 : 0;
    const cleaned = dropLineDots(binary, width, height, Math.max(24, Math.round(width * height * 0.00008)));
    lines = new Float32Array(cleaned.length);
    for (let index = 0; index < cleaned.length; index += 1) lines[index] = cleaned[index];
  }
  const diagonal = Math.SQRT1_2;
  const out = new Uint8ClampedArray(rgba.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const offset = index * 4;
      const alpha = coverage[index];

      if (alpha <= 0.04) {
        out[offset + 3] = 255;
        continue;
      }

      const level = levels ? levels[index] : 0;
      let value: number;

      if (mode === "engrave") {
        /*
         * Engraving on a face: the lit half stays paper, one set of thin lines
         * starts only in real mid-shadow, and the crossing sets are held back
         * for hair, cloth and dark accessories. Strokes stay under a pixel and
         * a half wide, so the comb reads as drawn lines instead of a grey wash
         * that darkens the skin.
         */
        const demand = 1 - shade[index];
        const first = Math.min(0.9, Math.max(0, (demand - 0.46) * 3));
        const second = Math.min(1, Math.max(0, (demand - 0.66) * 3.2));
        const third = Math.min(1.5, Math.max(0, (demand - 0.8) * 4));
        const ink = Math.max(
          hatchLine((x + y) * diagonal, 5, first),
          hatchLine((x - y) * diagonal, 5, second),
          hatchLine(x * 0.5 + y * 0.866, 4, third),
          Math.min(1, Math.max(0, (demand - 0.94) * 12)),
          lines[index],
        );
        value = 250 - ink * 244;
      } else if (mode === "flat") {
        value = STENCIL_TONES[Math.min(STENCIL_TONES.length - 1, level)];
      } else {
        value = CARTOON_INKS[Math.min(CARTOON_INKS.length - 1, level)];
        /* Ink, not a gradient: a feature is either drawn or it is flat. */
        if (lines[index] > 0.45) value = 0;
      }

      /* Coverage fades the cut into the black page: antialiasing, not a halo. */
      const rendered = value * alpha;
      out[offset] = rendered;
      out[offset + 1] = rendered;
      out[offset + 2] = rendered;
      out[offset + 3] = 255;
    }
  }

  return out;
}
