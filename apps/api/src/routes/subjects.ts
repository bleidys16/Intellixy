import { and, eq, gte, inArray, or } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { db } from "../db/client.js";
import { generationJobs, materials, questions, subjects, users } from "../db/schema.js";
import { getLimits, limitReached } from "../limits.js";
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
const ACTIVE_STATUSES = ["pendiente", "procesando"];
/** Cuánto tiempo sigue apareciendo un trabajo terminado, para que un cliente lento aún vea el resultado. */
const RECENT_JOB_WINDOW_MS = 10 * 60 * 1000;

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
    with: { topic: true, chunk: { with: { material: true } } },
  });
  // Se aplana el material de origen y se quita el fragmento completo del payload.
  res.json({
    questions: rows.map(({ chunk, ...q }) => ({
      ...q,
      material: { id: chunk.material.id, name: chunk.material.name, type: chunk.material.type },
    })),
  });
});

const generateSchema = z.object({
  materialId: z.string().uuid(),
  count: z.number().int().min(1).optional(),
});

/**
 * Encola la generación de preguntas de un material ya "listo" y responde 202 con el trabajo.
 * Gasta una generación de la cuota diaria; si el modelo falla, el worker la devuelve.
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

    // Un solo trabajo activo por material: evita el doble clic y cuota gastada dos veces.
    const active = await db.query.generationJobs.findFirst({
      where: and(
        eq(generationJobs.materialId, material.id),
        inArray(generationJobs.status, ACTIVE_STATUSES),
      ),
    });
    if (active) {
      res.status(409).json({ error: "Ya se están generando preguntas de este material", job: active });
      return;
    }

    // La cuota se reserva al encolar para que solicitudes simultáneas no se cuelen;
    // si el trabajo falla, el worker la devuelve.
    const usageEventId = await recordUsage(req.userId!, "ai_generation");
    try {
      const [job] = await db
        .insert(generationJobs)
        .values({
          subjectId: subject.id,
          materialId: material.id,
          userId: req.userId!,
          count,
          usageEventId,
        })
        .returning();
      res.status(202).json({ job });
    } catch (err) {
      await refundUsage(usageEventId).catch(() => {});
      throw err;
    }
  }),
);

/**
 * Trabajos de generación de la materia: los activos y los terminados hace poco. Con esto el
 * cliente recupera el estado al recargar la página o reabrir la app mientras se genera.
 */
subjectsRouter.get<{ id: string }>(
  "/:id/generations",
  safe(async (req, res) => {
    const subject = await db.query.subjects.findFirst({
      where: and(eq(subjects.id, req.params.id), eq(subjects.userId, req.userId!)),
    });
    if (!subject) {
      res.status(404).json({ error: "Materia no encontrada" });
      return;
    }
    const recentSince = new Date(Date.now() - RECENT_JOB_WINDOW_MS);
    const jobs = await db.query.generationJobs.findMany({
      where: and(
        eq(generationJobs.subjectId, subject.id),
        or(inArray(generationJobs.status, ACTIVE_STATUSES), gte(generationJobs.updatedAt, recentSince)),
      ),
      orderBy: (j, { desc }) => [desc(j.createdAt)],
    });
    res.json({ jobs });
  }),
);

subjectsRouter.get<{ id: string; jobId: string }>(
  "/:id/generations/:jobId",
  safe(async (req, res) => {
    if (!z.string().uuid().safeParse(req.params.jobId).success) {
      res.status(404).json({ error: "Trabajo no encontrado" });
      return;
    }
    const job = await db.query.generationJobs.findFirst({
      where: and(
        eq(generationJobs.id, req.params.jobId),
        eq(generationJobs.subjectId, req.params.id),
        eq(generationJobs.userId, req.userId!),
      ),
    });
    if (!job) {
      res.status(404).json({ error: "Trabajo no encontrado" });
      return;
    }
    res.json({ job });
  }),
);
