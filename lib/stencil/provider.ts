/**
 * The single art direction of Stencil Lab.
 *
 * The user never sees this and never writes one: the whole product exists to
 * keep one style constant while the subject changes.
 */
export const STENCIL_PROMPT = `Transform the provided image into a striking, high-contrast monochrome vector-stencil illustration.

Preserve the original subject's identity, facial structure when applicable, proportions, expression, clothing, accessories, pose, and all recognizable characteristics.

Use a powerful black, white, and grayscale palette, with sharply defined shadow shapes, dramatic chiaroscuro, crisp contours, simplified geometric tonal areas, and selective fine stencil or halftone texture.

Create the visual appearance of premium urban screen-print artwork, graphic-novel illustration, and iconic black-and-white poster design.

Replace distracting background elements with a pure black backdrop while maintaining the integrity and silhouette of the main subject.

Retain fine identifying details where important, especially in the face, eyes, beard, hair, and accessories.

The output must look like a professionally crafted digital illustration, not a photograph with a filter applied.

Avoid gradients, color, soft blur, photorealistic textures, unnecessary decorative elements, and added text.

Preserve the original framing and aspect ratio whenever possible.

Deliver a clean, sharp, visually powerful, high-resolution final illustration.`;

/** Model and output are configuration, never user input. */
export const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-nano-banana-2.1";

export type ImageSize = "1K" | "2K" | "4K";

/* An unknown resolution would be rejected upstream: fall back instead. */
function configuredSize(): ImageSize {
  const value = process.env.GEMINI_IMAGE_SIZE?.trim().toUpperCase();
  return value === "2K" || value === "4K" ? value : "1K";
}

export const IMAGE_SIZE: ImageSize = configuredSize();

/** Every aspect ratio the model accepts; anything else is rejected upstream. */
const ASPECT_RATIOS: ReadonlyArray<{ label: string; value: number }> = [
  { label: "1:1", value: 1 },
  { label: "1:4", value: 0.25 },
  { label: "1:8", value: 0.125 },
  { label: "2:3", value: 2 / 3 },
  { label: "3:2", value: 3 / 2 },
  { label: "3:4", value: 0.75 },
  { label: "4:1", value: 4 },
  { label: "4:3", value: 4 / 3 },
  { label: "4:5", value: 0.8 },
  { label: "5:4", value: 1.25 },
  { label: "8:1", value: 8 },
  { label: "9:16", value: 9 / 16 },
  { label: "16:9", value: 16 / 9 },
  { label: "21:9", value: 21 / 9 },
];

/**
 * Picks the closest supported frame instead of letting the model crop for us.
 * A square selfie stays square, a 4:5 portrait stays a portrait.
 */
export function nearestAspectRatio(width: number, height: number): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "1:1";
  }

  const target = width / height;
  let best = ASPECT_RATIOS[0];
  let bestDelta = Infinity;

  for (const ratio of ASPECT_RATIOS) {
    /* Distance in log space so 2:1 is as far from 4:1 as 1:2 is from 1:4. */
    const delta = Math.abs(Math.log(ratio.value) - Math.log(target));
    if (delta < bestDelta) {
      best = ratio;
      bestDelta = delta;
    }
  }

  return best.label;
}

export function apiKey(): string | undefined {
  return process.env.GEMINI_API_KEY?.trim() || undefined;
}

/*
 * Cloudflare Workers AI hosts FLUX.2 [klein] 9B, the same class of image editor
 * as the paid models, inside a free allowance of 10.000 neurons per day and
 * without a card on file. One picture costs ~1.545 neurons, so the daily free
 * budget is about six generations: enough for a studio demo, not for a render
 * farm, and the rate limit above keeps it there.
 */
export const CLOUDFLARE_MODEL =
  process.env.CLOUDFLARE_MODEL?.trim() || "@cf/black-forest-labs/flux-2-klein-9b";

function cloudflareCredentials(): { accountId: string; token: string } | undefined {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  return accountId && token ? { accountId, token } : undefined;
}

export type ProviderId = "cloudflare" | "gemini";

/** Free hosting wins when both are configured; STENCIL_PROVIDER overrides. */
export function activeProvider(): ProviderId | undefined {
  const forced = process.env.STENCIL_PROVIDER?.trim().toLowerCase();
  const cloudflare = cloudflareCredentials();

  if (forced === "gemini") {
    return apiKey() ? "gemini" : cloudflare ? "cloudflare" : undefined;
  }

  if (cloudflare) return "cloudflare";
  return apiKey() ? "gemini" : undefined;
}

export function activeModel(): string {
  return activeProvider() === "cloudflare" ? CLOUDFLARE_MODEL : MODEL;
}

export function isConfigured(): boolean {
  return activeProvider() !== undefined;
}

type ImagePayload = { data: string; mimeType: string };

/**
 * The Interactions API answers with an interaction whose image can sit in a few
 * shapes depending on the SDK and the model version. Walk the payload instead of
 * hard-coding one path, and keep the first image block we find.
 */
export function findImagePayload(value: unknown, depth = 0): ImagePayload | undefined {
  if (!value || typeof value !== "object" || depth > 8) return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImagePayload(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const mime = typeof record.mime_type === "string" ? record.mime_type : record.mimeType;
  const data = record.data;

  if (typeof mime === "string" && mime.startsWith("image/") && typeof data === "string" && data.length > 0) {
    return { data, mimeType: mime };
  }

  for (const key of ["output_image", "outputImage", "inline_data", "inlineData", "content", "contents", "steps", "output", "candidates", "parts"]) {
    const found = findImagePayload(record[key], depth + 1);
    if (found) return found;
  }

  return undefined;
}

/**
 * Google answers errors in more than one shape (object, array, plain string).
 * Read whatever is there so the log says why, not just that it failed.
 */
function upstreamMessage(body: string): string {
  const fallback = body.slice(0, 400) || "empty response";

  try {
    const parsed = JSON.parse(body) as unknown;
    const first = (Array.isArray(parsed) ? parsed[0] : parsed) as
      | { error?: { message?: string } | string; message?: string }
      | undefined;

    const candidate =
      typeof first?.error === "string" ? first.error : first?.error?.message ?? first?.message;

    return typeof candidate === "string" && candidate ? candidate.slice(0, 400) : fallback;
  } catch {
    return fallback;
  }
}

export type TransformResult = { bytes: Buffer; mimeType: string };

export class StencilError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * One image in, one image out. No storage, no queue, no retry storm: every
 * attempt is a paid generation, so a failure is reported instead of repeated.
 */
export type TransformInput = {
  bytes: Buffer;
  mimeType: string;
  width: number;
  height: number;
  timeoutMs?: number;
};

export async function transformImage(input: TransformInput): Promise<TransformResult> {
  if (activeProvider() === "cloudflare") return transformWithCloudflare(input);
  return transformWithGemini(input);
}

/**
 * Cloudflare answers either with a bare base64 string or with a data URL.
 * Read both so a format change upstream cannot break the page.
 */
export function readCloudflareImage(body: unknown): ImagePayload | undefined {
  const image = (body as { result?: { image?: unknown } } | undefined)?.result?.image;
  if (typeof image !== "string" || image.length === 0) return undefined;

  const dataUrl = /^data:(image\/[\w.+-]+);base64,([\s\S]+)$/.exec(image);
  if (dataUrl) return { mimeType: dataUrl[1], data: dataUrl[2] };

  return { mimeType: "image/png", data: image };
}

/** Cloudflare reports failures as { errors: [{ message }] }. */
function cloudflareMessage(body: string): string {
  const fallback = body.slice(0, 400) || "empty response";

  try {
    const parsed = JSON.parse(body) as { errors?: Array<{ message?: string }>; error?: string };
    const message = parsed.errors?.map((entry) => entry.message).filter(Boolean).join("; ");
    if (message) return message.slice(0, 400);
    if (typeof parsed.error === "string" && parsed.error) return parsed.error.slice(0, 400);
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * The model only accepts reference images under 512px per side, so the upload
 * is downscaled in memory: the original bytes are never written down.
 */
async function cloudflareInput(bytes: Buffer): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  return sharp(bytes)
    .rotate()
    .resize({ width: 511, height: 511, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer();
}

async function transformWithCloudflare(input: TransformInput): Promise<TransformResult> {
  const credentials = cloudflareCredentials();
  if (!credentials) throw new StencilError("Il generatore non è configurato su questo deploy.", 503);

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${credentials.accountId}/ai/run/${CLOUDFLARE_MODEL}`;

  let reference: Buffer;
  try {
    reference = await cloudflareInput(input.bytes);
  } catch (error) {
    console.error("stencil: could not prepare the reference image", error);
    throw new StencilError("Non riesco a leggere questa immagine. Prova un JPG o un PNG.", 422);
  }

  const form = new FormData();
  form.append(
    "prompt",
    `${STENCIL_PROMPT}\n\nRedraw input_image_0 as described above and keep its framing and aspect ratio.`,
  );
  form.append("input_image_0", new Blob([new Uint8Array(reference)], { type: "image/jpeg" }), "input.jpg");

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.token}` },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(input.timeoutMs ?? 180_000),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    console.error("stencil: provider unreachable", error);
    throw new StencilError(
      timedOut
        ? "La generazione è andata in timeout. Riprova con un'immagine più leggera."
        : "Il servizio di generazione non risponde.",
      timedOut ? 504 : 502,
    );
  }

  const body = await response.text();

  if (!response.ok) {
    const detail = cloudflareMessage(body);
    console.error("stencil: provider rejected the request", response.status, detail);

    if (response.status === 429) {
      throw new StencilError(
        /neuron|quota|daily/i.test(detail)
          ? "Il budget gratuito di oggi è finito. Torna domani: si azzera da solo."
          : "Il servizio di generazione è occupato. Aspetta un momento e riprova.",
        429,
      );
    }

    const keyProblem =
      response.status === 401 ||
      response.status === 403 ||
      /authentication|api token|permission|unauthor/i.test(detail);

    throw new StencilError(
      keyProblem
        ? "Il provider ha rifiutato la chiave del server: controlla CLOUDFLARE_API_TOKEN."
        : "Il servizio ha rifiutato questa immagine. Prova una foto più pulita e più piccola.",
      502,
    );
  }

  const payload = readCloudflareImage(safeJson(body));
  if (!payload) {
    console.error("stencil: no image in provider response", body.slice(0, 600));
    throw new StencilError("Il provider ha risposto senza immagine. Riprova.", 502);
  }

  return { bytes: Buffer.from(payload.data, "base64"), mimeType: payload.mimeType };
}

async function transformWithGemini(input: TransformInput): Promise<TransformResult> {
  const key = apiKey();
  if (!key) throw new StencilError("Il generatore non è configurato su questo deploy.", 503);

  const aspectRatio = nearestAspectRatio(input.width, input.height);

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(input.timeoutMs ?? 240_000),
      body: JSON.stringify({
        model: MODEL,
        input: [
          { type: "text", text: STENCIL_PROMPT },
          {
            type: "image",
            mime_type: input.mimeType,
            data: input.bytes.toString("base64"),
          },
        ],
        response_format: {
          type: "image",
          mime_type: "image/png",
          aspect_ratio: aspectRatio,
          image_size: IMAGE_SIZE,
        },
      }),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    console.error("stencil: provider unreachable", error);
    throw new StencilError(
      timedOut
        ? "La generazione è andata in timeout. Riprova con un'immagine più leggera."
        : "Il servizio di generazione non risponde.",
      timedOut ? 504 : 502,
    );
  }

  const body = await response.text();

  if (!response.ok) {
    const detail = upstreamMessage(body);
    console.error("stencil: provider rejected the request", response.status, detail);

    if (response.status === 429) {
      throw new StencilError("Il servizio di generazione è occupato. Aspetta un momento e riprova.", 429);
    }

    /* A rejected key is an operator problem and must read like one. */
    const keyProblem =
      response.status === 401 ||
      response.status === 403 ||
      /api key|permission|unauthor|not found/i.test(detail);

    throw new StencilError(
      keyProblem
        ? "Il provider ha rifiutato la chiave del server: controlla GEMINI_API_KEY."
        : "Il servizio ha rifiutato questa immagine. Prova una foto più pulita e più piccola.",
      502,
    );
  }

  const payload = findImagePayload(safeJson(body));
  if (!payload) {
    console.error("stencil: no image in provider response", body.slice(0, 600));
    throw new StencilError("Il provider ha risposto senza immagine. Riprova.", 502);
  }

  return { bytes: Buffer.from(payload.data, "base64"), mimeType: payload.mimeType };
}

function safeJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}
