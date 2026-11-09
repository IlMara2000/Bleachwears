/**
 * The upload arrives from a browser we do not trust, so the server reads the
 * real type and the real frame size from the bytes instead of the file name.
 */
export type ImageKind = "jpeg" | "png" | "webp";

export const MIME_BY_KIND: Record<ImageKind, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function sniffKind(bytes: Buffer): ImageKind | undefined {
  if (bytes.length < 12) return undefined;

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";

  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (pngSignature.every((byte, index) => bytes[index] === byte)) return "png";

  if (bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") return "webp";

  return undefined;
}

/** Zero-copy dimensions for the three formats we accept. */
export function readDimensions(bytes: Buffer, kind: ImageKind): { width: number; height: number } | undefined {
  if (kind === "png") {
    /* IHDR always starts at byte 16 of a valid PNG. */
    if (bytes.length < 24) return undefined;
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }

  if (kind === "jpeg") {
    let offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const marker = bytes[offset + 1];

      /* Start of frame markers carry the dimensions; skip padding and RSTn. */
      const isStartOfFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

      if (isStartOfFrame) {
        if (offset + 8 >= bytes.length) return undefined;
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }

      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }

      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2) return undefined;
      offset += 2 + length;
    }

    return undefined;
  }

  /* WEBP: VP8X stores canvas size minus one in 24-bit little endian. */
  if (bytes.length < 30) return undefined;
  const chunk = bytes.toString("latin1", 12, 16);

  if (chunk === "VP8X") {
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    return { width, height };
  }

  if (chunk === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    const width = 1 + (bits & 0x3fff);
    const height = 1 + ((bits >> 14) & 0x3fff);
    return { width, height };
  }

  if (chunk === "VP8 ") {
    const width = bytes.readUInt16LE(26) & 0x3fff;
    const height = bytes.readUInt16LE(28) & 0x3fff;
    if (!width || !height) return undefined;
    return { width, height };
  }

  return undefined;
}
