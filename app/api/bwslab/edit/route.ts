import { NextResponse } from "next/server";
import { budgetMessage, reserveGeneration } from "@/lib/stencil/budget";
import { clientIdFrom, takeToken } from "@/lib/stencil/rate-limit";
import { StencilError, activeModel, isConfigured, transformImage } from "@/lib/stencil/provider";
import { readImageUpload } from "@/lib/stencil/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Long enough for a real instruction, short enough to stay a prompt. */
const MAX_PROMPT_CHARS = 600;
const MIN_PROMPT_CHARS = 3;

/**
 * The prompt page of Stencil Lab: the user writes the instruction, the server
 * only enforces that it exists and that it fits. Everything else — which model,
 * how long, how much — stays configuration on our side.
 */
export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Il generatore non è configurato su questo deploy: manca la chiave del provider." },
      { status: 503 },
    );
  }

  const limit = takeToken(clientIdFrom(request));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Troppe trasformazioni da questa connessione. Riprova tra qualche minuto." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  /* Parsed once: the image is read from the same FormData below. */
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Manda immagine e prompt come form data multipart." }, { status: 400 });
  }

  const rawPrompt = form.get("prompt");

  /* Control characters would end up in the model's text encoder: they never help. */
  const prompt = typeof rawPrompt === "string" ? rawPrompt.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim() : "";

  if (prompt.length < MIN_PROMPT_CHARS) {
    return NextResponse.json({ error: "Scrivi cosa vuoi cambiare nell'immagine." }, { status: 400 });
  }

  if (prompt.length > MAX_PROMPT_CHARS) {
    return NextResponse.json(
      { error: `Il prompt è troppo lungo: massimo ${MAX_PROMPT_CHARS} caratteri.` },
      { status: 400 },
    );
  }

  const uploaded = await readImageUpload(form);
  if (!uploaded.ok) return uploaded.response;

  const reservation = await reserveGeneration();
  if (!reservation.allowed) {
    const { cap, used, resetAt } = reservation.budget;
    console.warn(JSON.stringify({ event: "bwslab.edit", ok: false, reason: "budget", cap, used }));

    return NextResponse.json(
      { error: budgetMessage(reservation.budget), budget: reservation.budget },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil((Date.parse(resetAt) - Date.now()) / 1000))),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const started = Date.now();

  try {
    const result = await transformImage({ ...uploaded.upload, prompt });

    console.info(
      JSON.stringify({
        event: "bwslab.edit",
        ok: true,
        input: { width: uploaded.upload.width, height: uploaded.upload.height, bytes: uploaded.upload.bytes.length },
        promptChars: prompt.length,
        outputBytes: result.bytes.length,
        ms: Date.now() - started,
        spend: { used: reservation.budget.used, cap: reservation.budget.cap },
      }),
    );

    return new NextResponse(new Uint8Array(result.bytes), {
      status: 200,
      headers: {
        "Content-Type": result.mimeType,
        "Content-Length": String(result.bytes.length),
        "Cache-Control": "no-store, max-age=0",
        "X-Stencil-Model": activeModel(),
      },
    });
  } catch (error) {
    const status = error instanceof StencilError ? error.status : 500;
    const message = error instanceof StencilError ? error.message : "Qualcosa si è rotto mentre disegnava. Riprova.";

    console.error(JSON.stringify({ event: "bwslab.edit", ok: false, status, ms: Date.now() - started }));

    return NextResponse.json({ error: message }, { status });
  }
}
