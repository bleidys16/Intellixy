import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { ExtractedMaterial } from "./types.js";

// pdfjs-dist no publica tipos para la build "legacy", así que se importa dinámico.
const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

const here = path.dirname(fileURLToPath(import.meta.url));
const standardFontDataUrl =
  path.join(here, "..", "node_modules", "pdfjs-dist", "standard_fonts") + path.sep;

export async function extractPdf(filePath: string): Promise<ExtractedMaterial> {
  const data = new Uint8Array(await readFile(filePath));
  const doc = await pdfjsLib.getDocument({ data, standardFontDataUrl }).promise;

  const pages = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push({ page: pageNum, text });
  }

  return { file: path.basename(filePath), pages };
}
