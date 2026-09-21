import { createRequire } from "node:module";
import path from "node:path";
import type { MaterialBlock } from "../ai/types.js";
import { ExtractionError } from "./errors.js";

// pdfjs-dist no publica tipos para la build "legacy", así que se importa dinámico.
const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

// Las fuentes estándar viven dentro del paquete; se resuelven desde donde npm lo haya instalado.
const require = createRequire(import.meta.url);
const standardFontDataUrl =
  path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts") + path.sep;

/** Menos texto que esto en todo el PDF se considera un PDF escaneado (solo imágenes). */
const MIN_TOTAL_CHARS = 50;

export interface ExtractedPdf {
  pageCount: number;
  /** Solo las páginas con texto; `page` conserva el número real de página del PDF. */
  pages: MaterialBlock[];
}

export async function extractPdf(data: Buffer, maxPages: number): Promise<ExtractedPdf> {
  let doc;
  try {
    doc = await pdfjsLib.getDocument({ data: new Uint8Array(data), standardFontDataUrl }).promise;
  } catch {
    throw new ExtractionError("No se pudo abrir el PDF: está dañado o protegido con contraseña");
  }

  try {
    if (doc.numPages > maxPages) {
      throw new ExtractionError(
        `El PDF tiene ${doc.numPages} páginas y tu plan permite hasta ${maxPages}`,
      );
    }

    const pages: MaterialBlock[] = [];
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) pages.push({ page: pageNum, text });
    }

    const totalChars = pages.reduce((sum, p) => sum + p.text.length, 0);
    if (totalChars < MIN_TOTAL_CHARS) {
      throw new ExtractionError(
        "El PDF no tiene texto seleccionable (parece escaneado). Sube fotos de las páginas o un PDF con texto",
      );
    }

    return { pageCount: doc.numPages, pages };
  } finally {
    await doc.destroy();
  }
}
