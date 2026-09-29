import path from "node:path";
import { pathToFileURL } from "node:url";
import type { MaterialBlock } from "../ai/types";
import { ExtractionError } from "./errors";

// pdfjs-dist no publica tipos para la build "legacy", así que se importa dinámico.
const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

// Copia propia de node_modules/pdfjs-dist/standard_fonts (ver ./standard_fonts): resolverla en
// runtime con require.resolve() contra el paquete no sobrevive el bundler de Next (falla en
// producción aunque funcione en Express/tsx normal) — con una ruta fija propia y
// `outputFileTracingIncludes` en next.config.ts se evita depender de esa resolución dinámica.
const standardFontDataUrl = path.join(process.cwd(), "src", "server", "extraction", "standard_fonts") + path.sep;

// pdfjs carga su worker "falso" con un import dinámico que el tracing de Next no detecta, y en
// la función serverless queda fuera. Se usa una copia propia (incluida con
// `outputFileTracingIncludes`) y se apunta a ella por ruta.
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.join(process.cwd(), "src", "server", "extraction", "pdfjs_worker", "pdf.worker.mjs"),
).href;

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
  } catch (err) {
    console.error("[extractPdf] getDocument falló:", err);
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
