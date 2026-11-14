import { NextResponse } from "next/server";
import { MIME_BY_KIND, readDimensions, sniffKind } from "./image-size";

/**
 * One place that decides what a valid upload is. The stencil page and the
 * prompt page accept exactly the same file, so the rule lives once.
 */

/** Vercel caps a request body at 4.5 MB: stay below it and refuse early. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export type AcceptedUpload = {
  bytes: Buffer;
  mimeType: string;
  width: number;
  height: number;
};

export type UploadResult =
  | { ok: true; upload: AcceptedUpload }
  | { ok: false; response: NextResponse };

/**
 * Takes the FormData the route already parsed: a request body can be read once,
 * so parsing it twice here would throw and every upload would fail.
 */
export async function readImageUpload(form: FormData): Promise<UploadResult> {
  const upload = form.get("image");

  if (!(upload instanceof File) || upload.size === 0) {
    return { ok: false, response: NextResponse.json({ error: "Nessuna immagine allegata." }, { status: 400 }) };
  }

  if (upload.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Immagine troppo grande: resta sotto i 4 MB." }, { status: 413 }),
    };
  }

  const bytes = Buffer.from(await upload.arrayBuffer());
  const kind = sniffKind(bytes);

  if (!kind) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Solo immagini JPG, PNG e WEBP." }, { status: 415 }),
    };
  }

  const size = readDimensions(bytes, kind);

  if (!size || size.width < 32 || size.height < 32) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Questa immagine sembra vuota o illeggibile." }, { status: 422 }),
    };
  }

  return {
    ok: true,
    upload: { bytes, mimeType: MIME_BY_KIND[kind], width: size.width, height: size.height },
  };
}
