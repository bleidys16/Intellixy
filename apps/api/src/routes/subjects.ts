import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { db } from "../db/client.js";
import { materials, questions, subjects, users } from "../db/schema.js";
import { getLimits, limitReached } from "../limits.js";
import { generateForMaterial } from "../questions/generateForMaterial.js";
import { countUsageLastDay, recordUsage, refundUsage } from "../usage.js";
import { safe } from "./safe.js";

export const subjectsRouter = Router();
subjectsRouter.use(requireAuth);

/** Un id que no es UUID nunca existe; sin esto Postgres lanza error de sintaxis y cae el proceso. */
subjectsRouter.param("id", (_req, res, next, id: string) => {
  if (!z.string().uuid().safeParse(id).success) {
    res.status(404).json({ error: "Materia no encontrada" });
    return;
  }
  next();
});

const DEFAULT_QUESTION_COUNT = 5;

const createSubjectSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
});

subjectsRouter.post("/", async (req, res) => {
  const parsed = createSubjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const [subject] = await db
    .insert(subjects)
    .values({ userId: req.userId!, name: parsed.data.name, color: parsed.data.color })
    .returning();

  res.status(201).json({ subject });
});

subjectsRouter.get("/", async (req, res) => {
  const rows = await db.query.subjects.findMany({
    where: eq(subjects.userId, req.userId!),
    orderBy: (s, { desc }) => [desc(s.createdAt)],
  });
  res.json({ subjects: rows });
});

subjectsRouter.get("/:id", async (req, res) => {
  const subject = await db.query.subjects.findFirst({
    where: and(eq(subjects.id, req.params.id), eq(subjects.userId, req.userId!)),
  });
  if (!subject) {
    res.status(404).json({ error: "Materia no encontrada" });
    return;
  }
  res.json({ subject });
});

subjectsRouter.get("/:id/questions", async (req, res) => {
  const subject = await db.query.subjects.findFirst({
    where: and(eq(subjects.id, req.params.id), eq(subjects.userId, req.userId!)),
  });
  if (!subject) {
    res.status(404).json({ error: "Materia no encontrada" });
    return;
  }

  const rows = await db.query.questions.findMany({
    where: eq(questions.subjectId, subject.id),
    orderBy: (q, { desc }) => [desc(q.createdAt)],
    with: { topic: true },
  });
  res.json({ questions: rows });
});

const generateSchema = z.object({
  materialId: z.string().uuid(),
  count: z.number().int().min(1).optional(),
});

/**
 * Genera preguntas de un material ya "listo". Gasta una generación de la cuota diaria;
 * si el modelo falla, la cuota se devuelve para que el usuario no pierda el intento.
 */
subjectsRouter.post<{ id: string }>(
  "/:id/questions/generate",
  safe(async (req, res) => {
    const subject = await db.query.subjects.findFirst({
      where: and(eq(subjects.id, req.params.id), eq(subjects.userId, req.userId!)),
    });
    if (!subject) {
      res.status(404).json({ error: "Materia no encontrada" });
      return;
    }

    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const count = parsed.data.count ?? DEFAULT_QUESTION_COUNT;

    const material = await db.query.materials.findFirst({
      where: and(eq(materials.id, parsed.data.materialId), eq(materials.subjectId, subject.id)),
    });
    if (!material) {
      res.status(404).json({ error: "Material no encontrado" });
      return;
    }
    if (material.status !== "listo") {
      res.status(409).json({ error: "El material todavía no está listo para generar preguntas" });
      return;
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, req.userId!) });
    const limits = getLimits(user?.plan ?? "free");
    if (count > limits.maxQuestionsPerGeneration) {
      limitReached(
        res,
        "maxQuestionsPerGeneration",
        `Tu plan permite hasta ${limits.maxQuestionsPerGeneration} preguntas por generación`,
        limits.maxQuestionsPerGeneration,
      );
      return;
    }
    const usedToday = await countUsageLastDay(req.userId!, "ai_generation");
    if (usedToday >= limits.aiGenerationsPerDay) {
      limitReached(
        res,
        "aiGenerationsPerDay",
        `Ya usaste tus ${limits.aiGenerationsPerDay} generaciones de hoy`,
        limits.aiGenerationsPerDay,
      );
      return;
    }

    // Se reserva antes de llamar al modelo para que solicitudes simultáneas no se cuelen.
    const usageId = await recordUsage(req.userId!, "ai_generation");
    try {
      const result = await generateForMaterial({
        subjectId: subject.id,
        materialId: material.id,
        count,
      });
      if (result.questions.length === 0) {
        await refundUsage(usageId).catch(() => {});
        res.status(422).json({
          error: "El modelo no produjo ninguna pregunta válida con cita verificable. Inténtalo de nuevo",
          discarded: result.discarded,
        });
        return;
      }
      res.status(201).json(result);
    } catch (err) {
      await refundUsage(usageId).catch(() => {});
      res.status(502).json({
        error: "No se pudieron generar preguntas con el modelo de IA",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }),
);
