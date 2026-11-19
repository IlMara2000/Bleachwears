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

export type ProviderId = "cloudflare" | "gemini" | "qwen" | "local";

/**
 * The two pages of Stencil Lab are two products, not two skins on one engine:
 * /bwslab prints the house stencil, /bwslab/nfsw runs the visitor's prompt.
 * Each one resolves its own provider, key and model from STENCIL_LAB_* or
 * STENCIL_PRESS_*, so a quota spent on one page cannot stop the other.
 */
export type Section = "lab" | "prompt";

const SECTION_ENV: Record<Section, string> = { lab: "LAB", prompt: "PRESS" };

/** What each page is built for; any provider that is configured can take over. */
const PREFERRED_PROVIDER: Record<Section, ProviderId> = { lab: "gemini", prompt: "qwen" };

function sectionVar(section: Section, name: string): string {
  return `STENCIL_${SECTION_ENV[section]}_${name}`;
}

/** STENCIL_LAB_* belongs to the lab, STENCIL_PRESS_* to the prompt press. */
function sectionSetting(section: Section, name: string): string | undefined {
  return process.env[sectionVar(section, name)]?.trim() || undefined;
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

/** One key per page, whoever answers: STENCIL_LAB_API_KEY / STENCIL_PRESS_API_KEY. */
export function geminiKey(section: Section = "lab"): string | undefined {
  return sectionSetting(section, "API_KEY") ?? (process.env.GEMINI_API_KEY?.trim() || undefined);
}

export function qwenKey(section: Section = "prompt"): string | undefined {
  return sectionSetting(section, "API_KEY") ?? (process.env.DASHSCOPE_API_KEY?.trim() || undefined);
}

/** Kept for callers that only ever meant the house style. */
export function apiKey(section: Section = "lab"): string | undefined {
  return geminiKey(section);
}

export const QWEN_DEFAULT_MODEL = "qwen-image-2.0-pro";

/**
 * Model Studio's image-editing endpoint. The region is a property of the key,
 * so the base URL is configuration: Singapore is the one that grants the free
 * quota, and a key from another region is rejected by this host.
 */
export const QWEN_ENDPOINT = `${(
  process.env.DASHSCOPE_BASE_URL?.trim() || "https://dashscope-intl.aliyuncs.com/api/v1"
).replace(/\/+$/, "")}/services/aigc/multimodal-generation/generation`;

function canRun(section: Section, provider: ProviderId): boolean {
  if (provider === "local") return true;
  if (provider === "cloudflare") return cloudflareCredentials() !== undefined;
  if (provider === "gemini") return geminiKey(section) !== undefined;
  return qwenKey(section) !== undefined;
}

function normalizeProvider(value: string): ProviderId | undefined {
  const id = value === "comfyui" ? "local" : value;
  return id === "local" || id === "cloudflare" || id === "gemini" || id === "qwen" ? id : undefined;
}

/**
 * The page's own choice wins, then its preferred provider, then whatever else
 * is configured. STENCIL_PROVIDER still forces both pages, which is what an
 * existing deploy already has in its environment.
 */
export function activeProvider(section: Section = "lab"): ProviderId | undefined {
  const asked = sectionSetting(section, "PROVIDER") ?? process.env.STENCIL_PROVIDER?.trim();
  const forced = asked ? normalizeProvider(asked.toLowerCase()) : undefined;

  /* "local" is the machine running this server: no key, no quota, no upload. */
  if (forced === "local") return "local";

  if (forced && canRun(section, forced)) return forced;

  const order: ProviderId[] = [PREFERRED_PROVIDER[section], "cloudflare", "gemini", "qwen"];
  for (const candidate of order) {
    if (candidate !== forced && canRun(section, candidate)) return candidate;
  }

  return undefined;
}

export function activeModel(section: Section = "lab"): string {
  const provider = activeProvider(section);
  const override = sectionSetting(section, "MODEL");

  if (provider === "local") return process.env.COMFYUI_MODEL?.trim() || COMFYUI_DEFAULTS.model;
  if (provider === "cloudflare") return override ?? CLOUDFLARE_MODEL;
  if (provider === "qwen") return override ?? (process.env.QWEN_IMAGE_MODEL?.trim() || QWEN_DEFAULT_MODEL);
  return override ?? MODEL;
}

export function isConfigured(section: Section = "lab"): boolean {
  return activeProvider(section) !== undefined;
}

/** Which variable to look at when a provider rejects the key. */
function keyHint(section: Section, provider: ProviderId): string {
  if (provider === "gemini") return `${sectionVar(section, "API_KEY")} (oppure GEMINI_API_KEY)`;
  if (provider === "qwen") return `${sectionVar(section, "API_KEY")} (oppure DASHSCOPE_API_KEY)`;
  return "CLOUDFLARE_API_TOKEN";
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
  /**
   * The one place a client may steer the model. Stencil Lab never sets it and
   * gets STENCIL_PROMPT; /bwslab/nfsw sets it and gets what the user typed.
   */
  prompt?: string;
  /** Which page is generating: each one carries its own provider and key. */
  section?: Section;
};

/** An empty or missing prompt falls back to the house style, never to nothing. */
function promptFor(input: TransformInput): string {
  const custom = input.prompt?.trim();
  return custom ? custom : STENCIL_PROMPT;
}

export async function transformImage(input: TransformInput): Promise<TransformResult> {
  const section = input.section ?? "lab";
  const provider = activeProvider(section);
  if (provider === "local") return transformWithComfyUI(input);
  if (provider === "cloudflare") return transformWithCloudflare(input, section);
  if (provider === "qwen") return transformWithQwen(input, section);
  return transformWithGemini(input, section);
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
  try {
    // Nome in variabile: il bundler per Cloudflare non deve includere sharp.
    const moduleName = "sharp";
    const imported = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ moduleName)) as {
      default: typeof import("sharp");
    };
    const sharp = imported.default;
    return await sharp(bytes)
      .rotate()
      .resize({ width: 511, height: 511, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer();
  } catch (error) {
    // Su Cloudflare Workers sharp non è disponibile: si usa l'immagine così com'è
    // invece di far fallire la richiesta.
    console.warn("stencil: sharp non disponibile, uso l'immagine originale", error);
    return bytes;
  }
}

async function transformWithCloudflare(
  input: TransformInput,
  section: Section,
): Promise<TransformResult> {
  const credentials = cloudflareCredentials();
  if (!credentials) throw new StencilError("Il generatore non è configurato su questo deploy.", 503);

  const model = activeModel(section);
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${credentials.accountId}/ai/run/${model}`;

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
    `${promptFor(input)}\n\nRedraw input_image_0 as described above and keep its framing and aspect ratio.`,
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
        ? `Il provider ha rifiutato la chiave del server: controlla ${keyHint(section, "cloudflare")}.`
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

/**
 * DashScope answers with the edited image as a signed URL that lives 24 hours,
 * or inline as a data URL. Read whichever came back.
 */
export function qwenImageRef(body: unknown): string | undefined {
  const content = (
    body as { output?: { choices?: Array<{ message?: { content?: unknown } }> } } | undefined
  )?.output?.choices?.[0]?.message?.content;

  if (!Array.isArray(content)) return undefined;

  for (const part of content) {
    const image = (part as { image?: unknown } | undefined)?.image;
    if (typeof image === "string" && image.length > 0) return image;
  }

  return undefined;
}

/** The image is served by OSS, not by the API: no key, but still a download. */
async function downloadQwenImage(reference: string): Promise<TransformResult> {
  const inline = /^data:(image\/[\w.+-]+);base64,([\s\S]+)$/.exec(reference);
  if (inline) return { bytes: Buffer.from(inline[2], "base64"), mimeType: inline[1] };

  const url = /^https?:\/\//i.test(reference) ? reference : `https://${reference}`;

  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
  } catch (error) {
    console.error("stencil: could not download the generated image", error);
    throw new StencilError("Non riesco a scaricare l'immagine generata. Riprova.", 502);
  }

  if (!response.ok) {
    console.error("stencil: generated image download failed", response.status);
    throw new StencilError("Non riesco a scaricare l'immagine generata. Riprova.", 502);
  }

  const declared = response.headers.get("content-type")?.split(";")[0]?.trim();
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    mimeType: declared?.startsWith("image/") ? declared : "image/png",
  };
}

/**
 * Qwen-Image-Edit on Model Studio: the image and one instruction, one round
 * trip. It is the natural engine for the prompt press, and its free quota is
 * granted per account and per model, not per key — the page's own key is the
 * only thing that makes its ceiling separate from the lab's.
 */
async function transformWithQwen(input: TransformInput, section: Section): Promise<TransformResult> {
  const key = qwenKey(section);
  if (!key) throw new StencilError("Il generatore non è configurato su questo deploy.", 503);

  let response: Response;
  try {
    response = await fetch(QWEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(input.timeoutMs ?? 240_000),
      body: JSON.stringify({
        model: activeModel(section),
        input: {
          messages: [
            {
              role: "user",
              content: [
                {
                  image: `data:${input.mimeType};base64,${input.bytes.toString("base64")}`,
                },
                { text: promptFor(input) },
              ],
            },
          ],
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
      throw new StencilError(
        /quota|limit|exceed/i.test(detail)
          ? "La quota gratuita del provider è finita. Torna domani o collega un'altra chiave."
          : "Il servizio di generazione è occupato. Aspetta un momento e riprova.",
        429,
      );
    }

    const keyProblem =
      response.status === 401 ||
      response.status === 403 ||
      /api.?key|invalidapikey|unauthor|permission|workspace/i.test(detail);

    throw new StencilError(
      keyProblem
        ? `Il provider ha rifiutato la chiave del server: controlla ${keyHint(section, "qwen")}.`
        : "Il servizio ha rifiutato questa immagine. Prova una foto più pulita e più piccola.",
      502,
    );
  }

  const reference = qwenImageRef(safeJson(body));
  if (!reference) {
    console.error("stencil: no image in provider response", body.slice(0, 600));
    throw new StencilError("Il provider ha risposto senza immagine. Riprova.", 502);
  }

  return downloadQwenImage(reference);
}

async function transformWithGemini(input: TransformInput, section: Section): Promise<TransformResult> {
  const key = geminiKey(section);
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
        model: activeModel(section),
        input: [
          { type: "text", text: promptFor(input) },
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
        ? `Il provider ha rifiutato la chiave del server: controlla ${keyHint(section, "gemini")}.`
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

/*
 * Local provider: ComfyUI with Qwen-Image-Edit 2509 (GGUF + Lightning LoRA) on
 * the same computer that serves this page. No key, no quota, no upload: the
 * pixels stay on the machine. It works only where the server can reach
 * 127.0.0.1, so a Vercel deploy cannot use it — by design, not by accident.
 */
export const COMFYUI_DEFAULTS = {
  url: "http://127.0.0.1:8188",
  model: "qwen-image-edit-2509-q2k-lightning",
  unet: "Qwen-Image-Edit-2509-Q2_K.gguf",
  clip: "Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf",
  vae: "qwen_image_vae.safetensors",
  lora: "Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors",
  steps: 4,
  cfg: 1,
  megapixels: 0.5,
} as const;

function comfyuiBase(): string {
  return (process.env.COMFYUI_URL?.trim() || COMFYUI_DEFAULTS.url).replace(/\/+$/, "");
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** The graph is built here, never accepted from the client. */
function comfyuiGraph(prompt: string, imageName: string) {
  const steps = envNumber("COMFYUI_STEPS", COMFYUI_DEFAULTS.steps);
  const cfg = envNumber("COMFYUI_CFG", COMFYUI_DEFAULTS.cfg);
  const megapixels = envNumber("COMFYUI_MEGAPIXELS", COMFYUI_DEFAULTS.megapixels);
  const unet = process.env.COMFYUI_UNET?.trim() || COMFYUI_DEFAULTS.unet;
  const clip = process.env.COMFYUI_CLIP?.trim() || COMFYUI_DEFAULTS.clip;
  const vae = process.env.COMFYUI_VAE?.trim() || COMFYUI_DEFAULTS.vae;
  const lora = process.env.COMFYUI_LORA?.trim() ?? COMFYUI_DEFAULTS.lora;

  const graph: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {
    "1": { class_type: "UnetLoaderGGUF", inputs: { unet_name: unet } },
    "2": { class_type: "CLIPLoaderGGUF", inputs: { clip_name: clip, type: "qwen_image" } },
    "3": { class_type: "VAELoader", inputs: { vae_name: vae } },
    "4": { class_type: "LoadImage", inputs: { image: imageName } },
    "5": {
      class_type: "ImageScaleToTotalPixels",
      inputs: { image: ["4", 0], upscale_method: "lanczos", megapixels, resolution_steps: 8 },
    },
    "6": {
      class_type: "TextEncodeQwenImageEditPlus",
      inputs: { clip: ["2", 0], prompt, vae: ["3", 0], image1: ["5", 0] },
    },
    "7": {
      class_type: "TextEncodeQwenImageEdit",
      inputs: { clip: ["2", 0], prompt: "", vae: ["3", 0] },
    },
    "8": { class_type: "VAEEncode", inputs: { pixels: ["5", 0], vae: ["3", 0] } },
    "10": {
      class_type: "KSampler",
      inputs: {
        model: [lora ? "9" : "1", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["8", 0],
        seed: Math.floor(Math.random() * 1_000_000),
        steps,
        cfg,
        sampler_name: "euler",
        scheduler: "simple",
        denoise: 1,
      },
    },
    "11": { class_type: "VAEDecode", inputs: { samples: ["10", 0], vae: ["3", 0] } },
    "12": { class_type: "SaveImage", inputs: { images: ["11", 0], filename_prefix: "bwslab" } },
  };

  if (lora) {
    graph["9"] = {
      class_type: "LoraLoaderModelOnly",
      inputs: { model: ["1", 0], lora_name: lora, strength_model: 1 },
    };
  }

  return graph;
}

type ComfyHistoryEntry = {
  outputs?: Record<string, { images?: Array<{ filename: string; subfolder?: string; type?: string }> }>;
  status?: { status_str?: string };
};

/**
 * Upload, queue, wait, download. ComfyUI is a job server, so the wait is a poll
 * with a deadline: the route is killed at 300s and a hung job must not.
 */
async function transformWithComfyUI(input: TransformInput): Promise<TransformResult> {
  const base = comfyuiBase();
  /* On this Mac one stencil takes ~5 minutes: the deadline is a knob, not a guess. */
  const budgetMs = input.timeoutMs ?? envNumber("COMFYUI_TIMEOUT_MS", 290_000);
  const deadline = Date.now() + budgetMs;

  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(input.bytes)], { type: input.mimeType }), "input.png");
  form.append("overwrite", "true");

  let imageName: string;
  try {
    const upload = await fetch(`${base}/upload/image`, {
      method: "POST",
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!upload.ok) throw new Error(`upload ${upload.status}`);
    const info = (await upload.json()) as { name?: string };
    if (!info.name) throw new Error("upload senza nome");
    imageName = info.name;
  } catch (error) {
    console.error("stencil: comfyui upload failed", error);
    throw new StencilError(
      "ComfyUI non risponde su questo computer: avvialo con start-comfy.sh.",
      503,
    );
  }

  let promptId: string;
  try {
    const queued = await fetch(`${base}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        prompt: comfyuiGraph(promptFor(input), imageName),
        client_id: `bwslab-${Date.now()}`,
      }),
    });
    const body = (await queued.json()) as { prompt_id?: string; node_errors?: unknown };
    if (!queued.ok || !body.prompt_id) {
      console.error("stencil: comfyui rejected the graph", JSON.stringify(body).slice(0, 600));
      throw new StencilError("ComfyUI ha rifiutato il grafo: controlla i modelli installati.", 502);
    }
    promptId = body.prompt_id;
  } catch (error) {
    if (error instanceof StencilError) throw error;
    console.error("stencil: comfyui queue failed", error);
    throw new StencilError(
      "ComfyUI non risponde su questo computer: avvialo con start-comfy.sh.",
      503,
    );
  }

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1_500));

    let entry: ComfyHistoryEntry | undefined;
    try {
      const response = await fetch(`${base}/history/${promptId}`, { cache: "no-store" });
      if (!response.ok) continue;
      entry = ((await response.json()) as Record<string, ComfyHistoryEntry>)[promptId];
    } catch {
      continue;
    }

    if (!entry) continue;

    if (entry.status?.status_str === "error") {
      console.error("stencil: comfyui job failed", JSON.stringify(entry.status).slice(0, 600));
      throw new StencilError("Il modello locale ha dato errore durante la generazione.", 502);
    }

    const image = Object.values(entry.outputs ?? {})
      .flatMap((output) => output.images ?? [])
      .at(0);
    if (!image) continue;

    const query = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder ?? "",
      type: image.type ?? "output",
    });

    const view = await fetch(`${base}/view?${query.toString()}`, { cache: "no-store" });
    if (!view.ok) throw new StencilError("Non riesco a scaricare l'immagine da ComfyUI.", 502);

    return {
      bytes: Buffer.from(await view.arrayBuffer()),
      mimeType: view.headers.get("content-type")?.split(";")[0] || "image/png",
    };
  }

  throw new StencilError(
    "Il modello locale ha superato il tempo massimo. Riprova con un'immagine più piccola.",
    504,
  );
}

function safeJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}
