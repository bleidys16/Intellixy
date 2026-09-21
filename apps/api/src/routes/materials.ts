import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { db } from "../db/client.js";
import { generationJobs, materialChunks, materials, questions, subjects, users } from "../db/schema.js";
import { detectFileType } from "../files/detectType.js";
import { getLimits, limitReached } from "../limits.js";
import { storage } from "../storage/index.js";
import { getOwnedSubject } from "./access.js";
import { safe } from "./safe.js";
import {
  countMaterialsInSubject,
  countUsageLastDay,
  getStorageUsedBytes,
  recordUsage,
} from "../usage.js";

export const materialsRouter = Router({ mergeParams: true });
materialsRouter.use(requireAuth);

const pasteTextSchema = z.object({
  name: z.string().min(1),
  text: z.string().min(50, "El texto es muy corto para generar preguntas útiles"),
});

const uuidSchema = z.string().uuid();

type Material = typeof materials.$inferSelect;

/** La ruta interna del archivo en el almacenamiento no se expone al cliente. */
function publicMaterial(material: Material) {
  const { storagePath: _storagePath, ...rest } = material;
  return rest;
}

/** Pega texto como material. Ya no genera preguntas: eso se pide aparte, por material. */
materialsRouter.post<{ subjectId: string }>(
  "/text",
  safe(async (req, res) => {
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

    const material = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(materials)
        .values({ subjectId: subject.id, type: "text", name, status: "listo", pageCount: 1 })
        .returning();
      await tx.insert(materialChunks).values({ materialId: created.id, page: 1, text });
      return created;
    });

    res.status(201).json({ material: publicMaterial(material) });
  }),
);

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

    res.status(202).json({ material: publicMaterial(material) });
  } catch (err) {
    console.error("Error al subir material:", err);
    if (storedKey) await storage.remove(storedKey).catch(() => {});
    res.status(500).json({ error: "Error al subir el archivo" });
  }
});

materialsRouter.get<{ subjectId: string }>(
  "/",
  safe(async (req, res) => {
    const subject = await getOwnedSubject(req.params.subjectId, req.userId!);
    if (!subject) {
      res.status(404).json({ error: "Materia no encontrada" });
      return;
    }
    const rows = await db.query.materials.findMany({
      where: eq(materials.subjectId, subject.id),
      orderBy: (m, { desc }) => [desc(m.createdAt)],
    });
    res.json({ materials: rows.map(publicMaterial) });
  }),
);

type MaterialParams = { subjectId: string; materialId: string };

async function getOwnedMaterial(params: MaterialParams, userId: string) {
  if (!uuidSchema.safeParse(params.materialId).success) return null;
  const subject = await getOwnedSubject(params.subjectId, userId);
  if (!subject) return null;
  return (
    (await db.query.materials.findFirst({
      where: and(eq(materials.id, params.materialId), eq(materials.subjectId, subject.id)),
    })) ?? null
  );
}

/** Un material con sus fragmentos por página: lo que lo hace "consultable". */
materialsRouter.get<MaterialParams>(
  "/:materialId",
  safe(async (req, res) => {
    const material = await getOwnedMaterial(req.params, req.userId!);
    if (!material) {
      res.status(404).json({ error: "Material no encontrado" });
      return;
    }
    const chunks = await db.query.materialChunks.findMany({
      where: eq(materialChunks.materialId, material.id),
      orderBy: (c, { asc }) => [asc(c.page)],
      columns: { id: true, page: true, text: true },
    });
    res.json({ material: publicMaterial(material), chunks });
  }),
);

/**
 * Devuelve a la cola un material que falló. Una imagen vuelve a gastar OCR con IA,
 * así que cuenta contra la cuota diaria igual que al subirla; un PDF no cuesta nada.
 */
materialsRouter.post<MaterialParams>(
  "/:materialId/retry",
  safe(async (req, res) => {
    const material = await getOwnedMaterial(req.params, req.userId!);
    if (!material) {
      res.status(404).json({ error: "Material no encontrado" });
      return;
    }
    if (material.status !== "error" || !material.storagePath) {
      res.status(409).json({ error: "Solo se pueden reintentar los materiales que fallaron" });
      return;
    }

    if (material.type === "image") {
      const user = await db.query.users.findFirst({ where: eq(users.id, req.userId!) });
      const limits = getLimits(user?.plan ?? "free");
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
      await recordUsage(req.userId!, "ai_ocr");
    }

    const [updated] = await db
      .update(materials)
      .set({ status: "pendiente", errorMessage: null, updatedAt: new Date() })
      .where(eq(materials.id, material.id))
      .returning();
    res.status(202).json({ material: publicMaterial(updated) });
  }),
);

/**
 * Borra el material, su archivo y sus fragmentos. Las preguntas generadas a partir de
 * esos fragmentos también se borran: sin su fuente ya no hay de dónde citarlas.
 * Borrar libera espacio del plan, pero no devuelve las cuotas diarias ya gastadas.
 */
materialsRouter.delete<MaterialParams>(
  "/:materialId",
  safe(async (req, res) => {
    const material = await getOwnedMaterial(req.params, req.userId!);
    if (!material) {
      res.status(404).json({ error: "Material no encontrado" });
      return;
    }
    if (material.status === "procesando") {
      res.status(409).json({ error: "El material se está procesando; espera a que termine" });
      return;
    }
    const generating = await db.query.generationJobs.findFirst({
      where: and(
        eq(generationJobs.materialId, material.id),
        inArray(generationJobs.status, ["pendiente", "procesando"]),
      ),
    });
    if (generating) {
      res.status(409).json({ error: "Se están generando preguntas de este material; espera a que termine" });
      return;
    }

    const questionsDeleted = await db.transaction(async (tx) => {
      const removed = await tx
        .delete(questions)
        .where(
          inArray(
            questions.chunkId,
            tx
              .select({ id: materialChunks.id })
              .from(materialChunks)
              .where(eq(materialChunks.materialId, material.id)),
          ),
        )
        .returning({ id: questions.id });
      await tx.delete(materials).where(eq(materials.id, material.id));
      return removed.length;
    });

    // Después de la base de datos: si esto falla queda un archivo huérfano, no un material roto.
    if (material.storagePath) {
      await storage.remove(material.storagePath).catch((err) => {
        console.error(`No se pudo borrar el archivo ${material.storagePath}:`, err);
      });
    }

    res.json({ deleted: true, questionsDeleted });
  }),
);
