import { NextResponse } from "next/server";
import { budgetMessage, reserveGeneration } from "@/lib/stencil/budget";
import { clientIdFrom, takeToken } from "@/lib/stencil/rate-limit";
import { StencilError, activeModel, isConfigured, transformImage } from "@/lib/stencil/provider";
import { readImageUpload } from "@/lib/stencil/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Manda l'immagine come form data multipart." }, { status: 400 });
  }

  const uploaded = await readImageUpload(form);
  if (!uploaded.ok) return uploaded.response;

  const { bytes, width, height, mimeType } = uploaded.upload;

  /*
   * The ceiling is checked here, before the provider is touched: a refused
   * generation must cost nothing. It counts the attempt, not the success.
   */
  const reservation = await reserveGeneration();
  if (!reservation.allowed) {
    const { cap, used, resetAt } = reservation.budget;
    console.warn(JSON.stringify({ event: "bwslab.budget", ok: false, cap, used }));

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
    const result = await transformImage({ bytes, mimeType, width, height });

    /* Real numbers only: this log line is the cost ledger. */
    console.info(
      JSON.stringify({
        event: "bwslab.transform",
        ok: true,
        input: { width, height, bytes: bytes.length },
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

    console.error(JSON.stringify({ event: "bwslab.transform", ok: false, status, ms: Date.now() - started }));

    return NextResponse.json({ error: message }, { status });
  }
}
