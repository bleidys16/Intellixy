import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWorker, type Worker } from "tesseract.js";

/**
 * Filtro previo al OCR con IA. El modelo de visión, ante una imagen sin texto
 * (solo figuras), a veces inventa un texto entero que luego entraría como "material
 * del estudiante". Tesseract corre en local, es gratis y no inventa: si no ve palabras,
 * la imagen se rechaza sin llamar a la IA. Calibrado con imágenes reales: letra a mano
 * ~75 palabras confiables, texto impreso ~24, imagen en blanco y figuras 0.
 */
const MIN_CONFIDENT_WORDS = 5;
const MIN_CONFIDENCE = 60;
const MIN_LETTERS = 3;

const here = path.dirname(fileURLToPath(import.meta.url));
const cachePath = process.env.TESSDATA_DIR
  ? path.resolve(process.env.TESSDATA_DIR)
  : path.resolve(here, "..", "..", ".cache", "tessdata");

let workerPromise: Promise<Worker> | null = null;

/** El worker (y los datos de idioma, que se descargan la primera vez) se reutilizan. */
function getWorker(): Promise<Worker> {
  workerPromise ??= createWorker("spa+eng", 1, { cachePath }).catch((err) => {
    workerPromise = null; // permite reintentar si la descarga de idiomas falló
    throw err;
  });
  return workerPromise;
}

/** true si la imagen tiene al menos unas pocas palabras legibles. */
export async function hasReadableText(image: Buffer): Promise<boolean> {
  const worker = await getWorker();
  const { data } = await worker.recognize(image, {}, { blocks: true });
  const words = (data.blocks ?? []).flatMap((b) =>
    b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)),
  );
  const confident = words.filter(
    (w) =>
      w.confidence >= MIN_CONFIDENCE &&
      w.text.replace(/[^\p{L}]/gu, "").length >= MIN_LETTERS,
  );
  return confident.length >= MIN_CONFIDENT_WORDS;
}
