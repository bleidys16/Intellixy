export type MaterialFileType = "pdf" | "image";

export interface DetectedFile {
  type: MaterialFileType;
  mime: string;
  ext: string;
}

/**
 * Detecta el tipo real del archivo por sus primeros bytes ("magic bytes"), no por
 * el nombre ni por el Content-Type que declara el cliente, que se pueden falsear.
 * Devuelve null si no es PDF, PNG, JPEG ni WebP.
 */
export function detectFileType(buf: Buffer): DetectedFile | null {
  if (buf.subarray(0, 1024).includes("%PDF-")) {
    return { type: "pdf", mime: "application/pdf", ext: "pdf" };
  }
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { type: "image", mime: "image/png", ext: "png" };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { type: "image", mime: "image/jpeg", ext: "jpg" };
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { type: "image", mime: "image/webp", ext: "webp" };
  }
  return null;
}
