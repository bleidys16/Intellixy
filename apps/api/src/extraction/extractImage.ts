import sharp from "sharp";
import { groqChat } from "../ai/groq.js";
import type { MaterialBlock } from "../ai/types.js";
import { hasReadableText } from "./detectText.js";
import { ExtractionError } from "./errors.js";

/**
 * Tope de la imagen en base64 dentro de la petición. El límite de ~180.000 caracteres de
 * Groq al formato <img> en línea; con `image_url` (el que usamos) se probó bien
 * hasta ~440.000, así que 400.000 deja margen. Más resolución ayuda con letra a mano.
 */
const MAX_BASE64_CHARS = 400_000;

/** Se prueban tamaños y calidades de mayor a menor hasta que la imagen quepa. */
const SIZE_STEPS = [
  { side: 1600, quality: 80 },
  { side: 1280, quality: 70 },
  { side: 1024, quality: 60 },
  { side: 800, quality: 50 },
];

/** Menos caracteres que esto se considera "sin texto" (el modelo a veces devuelve una letra suelta). */
const MIN_CHARS = 20;

/**
 * El prompt es deliberadamente estricto: con instrucciones más blandas este modelo,
 * ante una imagen sin texto (solo figuras), inventaba un ensayo con conocimiento propio
 * y eso habría entrado como "material del estudiante". Como sistema de OCR + etiquetas
 * <texto> responde vacío cuando no hay palabras escritas.
 */
const OCR_SYSTEM_PROMPT = `Eres un motor de OCR, no un asistente. Tu único trabajo es copiar las letras y palabras que están físicamente escritas o impresas en la imagen.
Reglas:
- Copia solo texto que veas escrito en la imagen. Nunca respondas preguntas, nunca expliques, nunca describas la imagen, nunca inventes ni completes con conocimiento propio.
- Devuelve la transcripción dentro de <texto> y </texto>.
- Si la imagen no tiene palabras escritas (por ejemplo, solo figuras, colores o dibujos), devuelve exactamente <texto></texto>.`;

/**
 * Se repite el formato en el mensaje del usuario: solo con el prompt de sistema, en textos
 * largos (sobre todo a mano) el modelo respondía con encabezados markdown en vez de <texto>.
 */
const OCR_USER_PROMPT =
  "Transcribe el texto de la imagen. Responde ÚNICAMENTE con <texto> seguido de la transcripción y </texto>. No uses markdown, ni títulos, ni asteriscos, ni comentarios; tu respuesta debe empezar con <texto>.";

/** Extrae lo que hay entre <texto> y </texto>; null si el modelo no respetó el formato. */
function parseOcrResponse(raw: string): string | null {
  const match = raw.match(/<texto>([\s\S]*?)(?:<\/texto>|$)/);
  return match ? match[1].trim() : null;
}

async function shrinkForOcr(data: Buffer): Promise<Buffer> {
  let smallest: Buffer | null = null;
  for (const { side, quality } of SIZE_STEPS) {
    const out = await sharp(data)
      .rotate() // respeta la orientación EXIF de las fotos del celular
      .flatten({ background: "#ffffff" }) // PNG con transparencia
      .grayscale()
      .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    if (out.toString("base64").length <= MAX_BASE64_CHARS) return out;
    smallest = out;
  }
  throw new ExtractionError(
    `No se pudo reducir la imagen lo suficiente para leerla (${smallest?.length ?? 0} bytes tras comprimir). Prueba con una foto más pequeña o más simple`,
  );
}

export async function extractImage(data: Buffer): Promise<MaterialBlock[]> {
  let jpeg: Buffer;
  try {
    jpeg = await shrinkForOcr(data);
  } catch (err) {
    if (err instanceof ExtractionError) throw err;
    throw new ExtractionError("No se pudo leer la imagen: el archivo está dañado");
  }

  // Filtro local antes de gastar IA: sin palabras legibles, no hay nada que transcribir.
  if (!(await hasReadableText(jpeg))) {
    throw new ExtractionError("No se encontró texto legible en la imagen");
  }

  const model = process.env.GROQ_VISION_MODEL ?? "qwen/qwen3.8-27b";
  const body = {
    model,
    temperature: 0,
    max_tokens: 4096,
    messages: [
      { role: "system", content: OCR_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: OCR_USER_PROMPT },
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` },
          },
        ],
      },
    ],
  };

  const attempts = 2;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await groqChat(body);
      const raw = String(res?.choices?.[0]?.message?.content ?? "");
      const text = parseOcrResponse(raw);
      if (text === null) {
        throw new Error(`El modelo no respetó el formato <texto>: ${raw.slice(0, 200)}`);
      }
      if (text.length < MIN_CHARS) {
        throw new ExtractionError("No se encontró texto legible en la imagen");
      }
      return [{ page: 1, text }];
    } catch (err) {
      if (err instanceof ExtractionError) throw err;
      lastError = err;
    }
  }
  throw lastError;
}
