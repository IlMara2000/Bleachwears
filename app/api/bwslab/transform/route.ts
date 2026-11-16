import { NextResponse } from "next/server";
import { budgetMessage, reserveGeneration } from "@/lib/stencil/budget";
import { claimRequest, completeRequest, failRequest, requestIdFrom } from "@/lib/stencil/idempotency";
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

  const requestId = requestIdFrom(request);
  const claimed = claimRequest(requestId);

  if (claimed.mode === "busy") {
    return NextResponse.json(
      { error: "Questa generazione è già in corso: aspetta che finisca invece di rilanciarla." },
      {
        status: 409,
        headers: { "Retry-After": String(claimed.retryAfterSeconds), "Cache-Control": "no-store" },
      },
    );
  }

  /*
   * A retry after a timeout gets the image the first attempt produced: it costs
   * nothing, so it comes before the rate limit and the daily guard.
   */
  if (claimed.mode === "reuse") {
    return new NextResponse(new Uint8Array(claimed.image.bytes), {
      status: 200,
      headers: {
        "Content-Type": claimed.image.mimeType,
        "Content-Length": String(claimed.image.bytes.length),
        "Cache-Control": "no-store, max-age=0",
        "X-Stencil-Model": activeModel(),
        "X-Stencil-Reused": "1",
      },
    });
  }

  const limit = takeToken(clientIdFrom(request));
  if (!limit.allowed) {
    /* Nessuna generazione: l'id va liberato, o il retry con lo stesso id troverebbe "in corso". */
    failRequest(requestId);
    return NextResponse.json(
      { error: "Troppe trasformazioni da questa connessione. Riprova tra qualche minuto." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    failRequest(requestId);
    return NextResponse.json({ error: "Manda l'immagine come form data multipart." }, { status: 400 });
  }

  const uploaded = await readImageUpload(form);
  if (!uploaded.ok) {
    failRequest(requestId);
    return uploaded.response;
  }

  const { bytes, width, height, mimeType } = uploaded.upload;

  /*
   * The ceiling is checked here, before the provider is touched: a refused
   * generation must cost nothing. It counts the attempt, not the success.
   */
  const reservation = await reserveGeneration("lab");
  if (!reservation.allowed) {
    const { cap, used, resetAt } = reservation.budget;
    console.warn(JSON.stringify({ event: "bwslab.budget", ok: false, cap, used }));
    /* Il tetto ha rifiutato prima di generare: niente immagine, niente id occupato. */
    failRequest(requestId);

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
        requestId: requestId ? "present" : "missing",
      }),
    );

    completeRequest(requestId, { bytes: result.bytes, mimeType: result.mimeType });

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

    /* No image came back, so the slot goes back on the day it was taken. */
    await reservation.refund();
    failRequest(requestId);

    console.error(JSON.stringify({ event: "bwslab.transform", ok: false, status, ms: Date.now() - started, refund: true }));

    return NextResponse.json({ error: message }, { status });
  }
}
