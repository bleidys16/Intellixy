import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { generateQuestions } from "../ai/generateQuestions.js";
import { requireAuth } from "../auth/middleware.js";
import { db } from "../db/client.js";
import { materialChunks, materials, questions, subjects, topics, users } from "../db/schema.js";
import { detectFileType } from "../files/detectType.js";
import { getLimits, limitReached } from "../limits.js";
import { storage } from "../storage/index.js";
import {
  countMaterialsInSubject,
  countUsageLastDay,
  getStorageUsedBytes,
  recordUsage,
} from "../usage.js";

export const materialsRouter = Router({ mergeParams: true });
materialsRouter.use(requireAuth);

const QUESTION_COUNT = 5;

const pasteTextSchema = z.object({
  name: z.string().min(1),
  text: z.string().min(50, "El texto es muy corto para generar preguntas útiles"),
});

async function getOwnedSubject(subjectId: string, userId: string) {
  return db.query.subjects.findFirst({
    where: and(eq(subjects.id, subjectId), eq(subjects.userId, userId)),
  });
}

materialsRouter.post<{ subjectId: string }>("/text", async (req, res) => {
  const subject = await getOwnedSubject(req.params.subjectId, req.userId!);
  if (!subject) {
    res.status(404).json({ error: "Materia no encontrada" });
    return;
  }

  const parsed = pasteTextSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { name, text } = parsed.data;

  const [material] = await db
    .insert(materials)
    .values({ subjectId: subject.id, type: "text", name, status: "listo" })
    .returning();

  const [chunk] = await db
    .insert(materialChunks)
    .values({ materialId: material.id, page: 1, text })
    .returning();

  let generated;
  try {
    generated = await generateQuestions([{ page: 1, text }], QUESTION_COUNT);
  } catch (err) {
    res.status(502).json({
      error: "No se pudieron generar preguntas con el modelo de IA",
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const savedQuestions = [];
  for (const q of generated) {
    const [topic] = await db
      .insert(topics)
      .values({ subjectId: subject.id, name: q.topic })
      .onConflictDoNothing({ target: [topics.subjectId, topics.name] })
      .returning();

    const topicRow =
      topic ??
      (await db.query.topics.findFirst({
        where: and(eq(topics.subjectId, subject.id), eq(topics.name, q.topic)),
      }));
    if (!topicRow) continue;

    const [saved] = await db
      .insert(questions)
      .values({
        subjectId: subject.id,
        topicId: topicRow.id,
        chunkId: chunk.id,
        prompt: q.question,
        options: q.options,
        correctOption: q.correctOption,
        explanation: q.explanation,
        sourceQuote: q.source.quote,
      })
      .returning();
    savedQuestions.push({ ...saved, topic: { id: topicRow.id, name: topicRow.name } });
  }

  res.status(201).json({ material, questions: savedQuestions });
});

/** Ejecuta multer como promesa; el tope de tamaño sale del plan del usuario. */
function parseUpload(req: Request, res: Response, maxFileBytes: number): Promise<void> {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxFileBytes, files: 1 },
  }).single("file");
  return new Promise((resolve, reject) => {
    upload(req, res, (err: unknown) => (err ? reject(err) : resolve()));
  });
}

/**
 * Sube un PDF o una imagen. Responde 202 en cuanto guarda el archivo y crea el
 * material en "pendiente": la extracción de texto corre después, en segundo plano.
 * Los límites por PDF (páginas) se comprueban al extraer, porque antes no se conocen.
 */
materialsRouter.post<{ subjectId: string }>("/upload", async (req, res) => {
  let storedKey: string | null = null;
  try {
    const subject = await getOwnedSubject(req.params.subjectId, req.userId!);
    if (!subject) {
      res.status(404).json({ error: "Materia no encontrada" });
      return;
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, req.userId!) });
    if (!user) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }
    const limits = getLimits(user.plan);

    const materialCount = await countMaterialsInSubject(subject.id);
    if (materialCount >= limits.maxMaterialsPerSubject) {
      limitReached(
        res,
        "maxMaterialsPerSubject",
        `Esta materia ya tiene ${limits.maxMaterialsPerSubject} materiales, que es el máximo de tu plan`,
        limits.maxMaterialsPerSubject,
      );
      return;
    }

    try {
      await parseUpload(req, res, limits.maxFileBytes);
    } catch (err) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        limitReached(
          res,
          "maxFileBytes",
          `El archivo supera el máximo de ${Math.round(limits.maxFileBytes / (1024 * 1024))} MB de tu plan`,
          limits.maxFileBytes,
        );
      } else {
        res.status(400).json({ error: "No se pudo leer el archivo subido" });
      }
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Falta el archivo (campo 'file')" });
      return;
    }

    const detected = detectFileType(file.buffer);
    if (!detected) {
      res.status(415).json({ error: "Formato no soportado. Sube un PDF, PNG, JPG o WebP" });
      return;
    }

    const storageUsed = await getStorageUsedBytes(req.userId!);
    if (storageUsed + file.size > limits.maxStorageBytes) {
      limitReached(
        res,
        "maxStorageBytes",
        "No queda espacio suficiente en tu plan para este archivo",
        limits.maxStorageBytes,
      );
      return;
    }

    // Las imágenes gastan OCR con IA: se reserva la cuota al subir, no al procesar,
    // para que una ráfaga de subidas no se cuele por encima del límite diario.
    if (detected.type === "image") {
      const ocrToday = await countUsageLastDay(req.userId!, "ai_ocr");
      if (ocrToday >= limits.ocrImagesPerDay) {
        limitReached(
          res,
          "ocrImagesPerDay",
          `Ya usaste tus ${limits.ocrImagesPerDay} imágenes con OCR de hoy`,
          limits.ocrImagesPerDay,
        );
        return;
      }
    }

    // multer decodifica el nombre como latin1; se recupera el UTF-8 original.
    const originalName = Buffer.from(file.originalname, "latin1").toString("utf-8");
    const fallbackName = originalName.replace(/\.[^.]+$/, "");
    const rawName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const name = (rawName || fallbackName || "Material sin nombre").slice(0, 200);

    storedKey = `${req.userId}/${randomUUID()}.${detected.ext}`;
    await storage.save(storedKey, file.buffer);

    const [material] = await db
      .insert(materials)
      .values({
        subjectId: subject.id,
        type: detected.type,
        name,
        status: "pendiente",
        storagePath: storedKey,
        mimeType: detected.mime,
        sizeBytes: file.size,
      })
      .returning();
    storedKey = null; // ya quedó ligado a un material; no se borra en el catch

    await recordUsage(req.userId!, "upload");
    if (detected.type === "image") await recordUsage(req.userId!, "ai_ocr");

    res.status(202).json({ material });
  } catch (err) {
    console.error("Error al subir material:", err);
    if (storedKey) await storage.remove(storedKey).catch(() => {});
    res.status(500).json({ error: "Error al subir el archivo" });
  }
});
