/**
 * Pure vector maths for the cartoon look: tracing flat tone regions into
 * closed loops and rounding them. No canvas, no DOM, so it can be tested.
 */

/**
 * Vector pass for the cartoon look. Flat pixel tones still carry photographic
 * noise and wobbly edges; tracing their outlines and smoothing the result is
 * what makes the poster read as drawn rather than filtered.
 */

/**
 * Crack following around a binary mask. Every edge of a set pixel that faces
 * an unset pixel becomes a directed segment, and segments are chained into
 * closed loops. With the even-odd fill rule the inner ones punch holes, so a
 * shape with a hole needs no special case.
 */
export function tracePolygons(
  binary: Uint8Array,
  width: number,
  height: number,
  minArea = 30,
): number[][] {
  const key = (x: number, y: number) => y * (width + 1) + x;

  /* Store edges by their start vertex, keeping a bucket per vertex. */
  const buckets = new Map<number, number[]>();
  const pushEdge = (x0: number, y0: number, x1: number, y1: number) => {
    const from = key(x0, y0);
    const to = key(x1, y1);
    const list = buckets.get(from);
    if (list) list.push(to);
    else buckets.set(from, [to]);
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (binary[y * width + x] === 0) continue;
      if (y === 0 || binary[(y - 1) * width + x] === 0) pushEdge(x, y, x + 1, y);
      if (y === height - 1 || binary[(y + 1) * width + x] === 0) pushEdge(x + 1, y + 1, x, y + 1);
      if (x === 0 || binary[y * width + x - 1] === 0) pushEdge(x, y + 1, x, y);
      if (x === width - 1 || binary[y * width + x + 1] === 0) pushEdge(x + 1, y, x + 1, y + 1);
    }
  }

  const polygons: number[][] = [];
  for (const [from, list] of buckets) {
    while (list.length > 0) {
      const loop: number[] = [];
      let vertex = from;
      let guard = 0;

      while (guard < 1_000_000) {
        const outgoing = buckets.get(vertex);
        if (!outgoing || outgoing.length === 0) break;
        const to = outgoing.pop() as number;
        loop.push(vertex % (width + 1), Math.floor(vertex / (width + 1)));
        vertex = to;
        guard += 1;
        if (vertex === from) break;
      }

      if (loop.length < 8) continue;

      let area = 0;
      for (let index = 0; index < loop.length; index += 2) {
        const nx = (index + 2) % loop.length;
        area += loop[index] * loop[nx + 1] - loop[nx] * loop[index + 1];
      }
      if (Math.abs(area) / 2 < minArea) continue;
      polygons.push(loop);
    }
  }

  return polygons;
}

/** Chaikin corner cutting: a square becomes a rounded blob in two passes. */
export function smoothPolygon(points: number[], passes = 2, closed = true): number[] {
  let current = points;
  for (let pass = 0; pass < passes; pass += 1) {
    const out: number[] = [];
    const count = current.length / 2;
    const limit = closed ? count : count - 1;
    for (let index = 0; index < limit; index += 1) {
      const ax = current[index * 2];
      const ay = current[index * 2 + 1];
      const nextIndex = ((index + 1) % count) * 2;
      const bx = current[nextIndex];
      const by = current[nextIndex + 1];
      out.push(ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25);
      out.push(ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75);
    }
    if (!closed) out.push(current[current.length - 2], current[current.length - 1]);
    current = out;
  }
  return current;
}

/** Majority vote on a binary map: one pass irons out the one-pixel jitter. */
export function settleBinary(binary: Uint8Array, width: number, height: number, passes: number): Uint8Array {
  let current = binary;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Uint8Array(current.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let votes = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            votes += current[ny * width + nx];
          }
        }
        next[y * width + x] = votes >= 5 ? 1 : 0;
      }
    }
    current = next;
  }
  return current;
}

/**
 * Keeps only stroke-shaped components: eyebrows, lips, the brim of a hat. A
 * blob of texture is round, so its area fills its bounding box; a drawn line
 * does not. This is what stops a beard from becoming confetti.
 */
export function keepLinear(
  binary: Uint8Array,
  width: number,
  height: number,
  minArea: number,
  maxFill = 0.62,
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
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;

    while (top > 0) {
      const index = stack[--top];
      pixels.push(index);
      const x = index % width;
      const y = (index - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
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

    const area = pixels.length;
    if (area < minArea) continue;
    const box = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1));
    if (area / box > maxFill) continue;
    for (const index of pixels) keep[index] = 1;
  }

  return keep;
}

