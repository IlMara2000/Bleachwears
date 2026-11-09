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

/** Closes pinholes: anything the frame cannot reach from inside a silhouette. */
export function fillHoles(mask: Mask): Mask {
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

  const out = new Uint8Array(data.length);
  for (let index = 0; index < data.length; index += 1) {
    out[index] = data[index] === 1 || reachable[index] === 0 ? 1 : 0;
  }
  return { data: out, width, height };
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

/**
 * Turns the photo into flat inks inside the mask and pure black outside.
 * `hatch` decides whether mid tones get the diagonal engraving lines.
 */
export function stylize(
  rgba: Uint8ClampedArray,
  coverage: Float32Array,
  width: number,
  height: number,
  options: { hatch?: boolean } = {},
): Uint8ClampedArray {
  const hatch = options.hatch ?? true;
  const luminance = new Float32Array(width * height);

  for (let index = 0; index < luminance.length; index += 1) {
    const offset = index * 4;
    luminance[index] = 0.2126 * rgba[offset] + 0.7152 * rgba[offset + 1] + 0.0722 * rgba[offset + 2];
  }

  /* Sample the subject, thinned to a fixed budget so sorting stays cheap. */
  let covered = 0;
  for (let index = 0; index < luminance.length; index += 1) {
    if (coverage[index] > 0.5) covered += 1;
  }
  const stride = Math.max(1, Math.ceil(covered / 6000));
  const samples: number[] = [];
  for (let index = 0; index < luminance.length && stride > 0; index += 1) {
    if (coverage[index] > 0.5 && index % stride === 0) samples.push(luminance[index]);
  }

  samples.sort((a, b) => a - b);
  /* Stretch to the subject, not the frame: a bright sky must not flatten a face. */
  const low = percentile(samples, 0.02);
  const high = Math.max(low + 12, percentile(samples, 0.98));
  const span = high - low;

  /* Tones first, then a majority vote: photo grain must not become confetti. */
  const tones = new Uint8Array(luminance.length);
  for (let index = 0; index < luminance.length; index += 1) {
    const stretched = Math.min(1, Math.max(0, (luminance[index] - low) / span));
    let tone = 3;
    for (let step = 0; step < TONE_CUTS.length; step += 1) {
      if (stretched < TONE_CUTS[step]) {
        tone = step;
        break;
      }
    }
    tones[index] = tone;
  }
  const flat = settleTones(tones, coverage, width, height, 2);

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

      const tone = flat[index];
      let value = STENCIL_TONES[tone];

      /* Diagonal strokes shade the darkest band without speckling the face. */
      if (hatch && tone === 1 && (x + y) % 6 < 2) value = STENCIL_TONES[0];

      const ink = value * alpha;
      out[offset] = ink;
      out[offset + 1] = ink;
      out[offset + 2] = ink;
      out[offset + 3] = 255;
    }
  }

  return out;
}
