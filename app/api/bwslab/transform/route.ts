import { NextResponse } from "next/server";
import { MIME_BY_KIND, readDimensions, sniffKind } from "@/lib/stencil/image-size";
import { clientIdFrom, takeToken } from "@/lib/stencil/rate-limit";
import { StencilError, isConfigured, transformImage } from "@/lib/stencil/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Vercel caps a request body at 4.5 MB: stay below it and refuse early. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Il generatore non è configurato su questo deploy: aggiungi GEMINI_API_KEY e riprova." },
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

  let upload: FormDataEntryValue | null;
  try {
    const form = await request.formData();
    upload = form.get("image");
  } catch {
    return NextResponse.json({ error: "Manda l'immagine come form data multipart." }, { status: 400 });
  }

  if (!(upload instanceof File) || upload.size === 0) {
    return NextResponse.json({ error: "Nessuna immagine allegata." }, { status: 400 });
  }

  if (upload.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Immagine troppo grande: resta sotto i 4 MB." }, { status: 413 });
  }

  const bytes = Buffer.from(await upload.arrayBuffer());
  const kind = sniffKind(bytes);
  if (!kind) {
    return NextResponse.json({ error: "Solo immagini JPG, PNG e WEBP." }, { status: 415 });
  }

  const size = readDimensions(bytes, kind);
  if (!size || size.width < 32 || size.height < 32) {
    return NextResponse.json({ error: "Questa immagine sembra vuota o illeggibile." }, { status: 422 });
  }

  const started = Date.now();

  try {
    const result = await transformImage({
      bytes,
      mimeType: MIME_BY_KIND[kind],
      width: size.width,
      height: size.height,
    });

    /* Real numbers only: this log line is the cost ledger. */
    console.info(
      JSON.stringify({
        event: "bwslab.transform",
        ok: true,
        input: { width: size.width, height: size.height, bytes: bytes.length },
        outputBytes: result.bytes.length,
        ms: Date.now() - started,
      }),
    );

    return new NextResponse(new Uint8Array(result.bytes), {
      status: 200,
      headers: {
        "Content-Type": result.mimeType,
        "Content-Length": String(result.bytes.length),
        "Cache-Control": "no-store, max-age=0",
        "X-Stencil-Model": process.env.GEMINI_MODEL?.trim() || "gemini-nano-banana-2.1",
      },
    });
  } catch (error) {
    const status = error instanceof StencilError ? error.status : 500;
    const message = error instanceof StencilError ? error.message : "Qualcosa si è rotto mentre disegnava. Riprova.";

    console.error(JSON.stringify({ event: "bwslab.transform", ok: false, status, ms: Date.now() - started }));

    return NextResponse.json({ error: message }, { status });
  }
}
