import { and, eq, lte } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { db } from "../db/client.js";
import { flashcardReviews, flashcards } from "../db/schema.js";
import { MAX_BOX, nextState, REVIEW_RESULTS } from "../flashcards/leitner.js";
import { enqueueGeneration } from "../generation/enqueue.js";
import { getOwnedSubject, isUuid } from "./access.js";
import { safe } from "./safe.js";

/**
 * Tarjetas de estudio con repetición espaciada (Leitner, 5 cajas). Las tarjetas se generan con IA
 * por la misma cola que las preguntas; repasarlas no gasta IA. Los "pendientes" son las que ya
 * vencieron (`dueAt` <= ahora): las nuevas nacen vencidas.
 */
export const flashcardsRouter = Router({ mergeParams: true });
flashcardsRouter.use(requireAuth);

const DEFAULT_DUE_LIMIT = 20;
const MAX_DUE_LIMIT = 50;

const generateSchema = z.object({
  materialId: z.string().uuid(),
  count: z.number().int().min(1).optional(),
});
const reviewSchema = z.object({ result: z.enum(REVIEW_RESULTS) });

async function loadCards(options: { where: ReturnType<typeof and>; limit?: number; oldestDueFirst?: boolean }) {
  return db.query.flashcards.findMany({
    where: options.where,
    orderBy: (c, { asc }) => (options.oldestDueFirst ? [asc(c.dueAt), asc(c.createdAt)] : [asc(c.createdAt)]),
    limit: options.limit,
    with: { topic: true, chunk: { with: { material: true } } },
  });
}

type CardRow = Awaited<ReturnType<typeof loadCards>>[number];

function toCard(c: CardRow) {
  return {
    id: c.id,
    front: c.front,
    back: c.back,
    box: c.box,
    dueAt: c.dueAt,
    createdAt: c.createdAt,
    topic: { id: c.topic.id, name: c.topic.name },
    source: {
      quote: c.sourceQuote,
      page: c.chunk.page,
      materialId: c.chunk.material.id,
      materialName: c.chunk.material.name,
      materialType: c.chunk.material.type,
    },
  };
}

/**
 * Totales de la materia. Se calcula en JavaScript con la misma hora que se usa al repasar,
 * así "pendientes" nunca depende de la zona horaria de la base de datos.
 */
async function getStats(subjectId: string) {
  const rows = await db
    .select({ box: flashcards.box, dueAt: flashcards.dueAt })
    .from(flashcards)
    .where(eq(flashcards.subjectId, subjectId));
  const now = Date.now();
  const byBox = Array.from({ length: MAX_BOX }, () => 0);
  let due = 0;
  let nextDueAt: Date | null = null;
  for (const r of rows) {
    byBox[r.box - 1]++;
    if (r.dueAt.getTime() <= now) due++;
    else if (!nextDueAt || r.dueAt < nextDueAt) nextDueAt = r.dueAt;
  }
  return { total: rows.length, due, byBox, nextDueAt };
}

type SubjectParams = { subjectId: string };
type CardParams = SubjectParams & { cardId: string };

/** Encola la generación de tarjetas de un material "listo" (202 con el trabajo). Comparte cuota con las preguntas. */
flashcardsRouter.post<SubjectParams>(
  "/generate",
  safe(async (req, res) => {
    const subject = await getOwnedSubject(req.params.subjectId, req.userId!);
    if (!subject) {
      res.status(404).json({ error: "Materia no encontrada" });
      return;
    }
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const result = await enqueueGeneration({
      userId: req.userId!,
      subjectId: subject.id,
      materialId: parsed.data.materialId,
      kind: "tarjetas",
      count: parsed.data.count,
    });
    res.status(result.status).json(result.body);
  }),
);

/** Todas las tarjetas de la materia, con los totales por caja. */
flashcardsRouter.get<SubjectParams>(
  "/",
  safe(async (req, res) => {
    const subject = await getOwnedSubject(req.params.subjectId, req.userId!);
    if (!subject) {
      res.status(404).json({ error: "Materia no encontrada" });
      return;
    }
    const [cards, stats] = await Promise.all([
      loadCards({ where: eq(flashcards.subjectId, subject.id) }),
      getStats(subject.id),
    ]);
    res.json({ flashcards: cards.map(toCard), stats });
  }),
);

/** La cola de hoy: tarjetas vencidas, las más atrasadas primero. */
flashcardsRouter.get<SubjectParams>(
  "/due",
  safe(async (req, res) => {
    const subject = await getOwnedSubject(req.params.subjectId, req.userId!);
    if (!subject) {
      res.status(404).json({ error: "Materia no encontrada" });
      return;
    }
    const requested = Number(req.query.limit);
    const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX_DUE_LIMIT) : DEFAULT_DUE_LIMIT;
    const [cards, stats] = await Promise.all([
      loadCards({
        where: and(eq(flashcards.subjectId, subject.id), lte(flashcards.dueAt, new Date())),
        limit,
        oldestDueFirst: true,
      }),
      getStats(subject.id),
    ]);
    res.json({ cards: cards.map(toCard), stats });
  }),
);

/** Registra un repaso y mueve la tarjeta de caja según Leitner. Solo se puede repasar una tarjeta vencida. */
flashcardsRouter.post<CardParams>(
  "/:cardId/review",
  safe(async (req, res) => {
    const subject = await getOwnedSubject(req.params.subjectId, req.userId!);
    if (!subject || !isUuid(req.params.cardId)) {
      res.status(404).json({ error: "Tarjeta no encontrada" });
      return;
    }
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const [card] = await loadCards({
      where: and(eq(flashcards.id, req.params.cardId), eq(flashcards.subjectId, subject.id)),
    });
    if (!card) {
      res.status(404).json({ error: "Tarjeta no encontrada" });
      return;
    }

    const now = new Date();
    if (card.dueAt.getTime() > now.getTime()) {
      res.status(409).json({ error: "Esta tarjeta todavía no toca repasarla", dueAt: card.dueAt });
      return;
    }

    const next = nextState(card.box, parsed.data.result, now);
    const saved = await db.transaction(async (tx) => {
      // Filtrar por "sigue vencida" evita contar dos veces un doble clic: la primera petición
      // adelanta `dueAt` y la segunda ya no encuentra la fila.
      const updated = await tx
        .update(flashcards)
        .set({ box: next.box, dueAt: next.dueAt })
        .where(and(eq(flashcards.id, card.id), lte(flashcards.dueAt, now)))
        .returning({ id: flashcards.id });
      if (updated.length === 0) return false;
      await tx.insert(flashcardReviews).values({
        flashcardId: card.id,
        result: parsed.data.result,
        boxAfter: next.box,
        reviewedAt: now,
        nextDueAt: next.dueAt,
      });
      return true;
    });
    if (!saved) {
      res.status(409).json({ error: "Esta tarjeta ya se repasó" });
      return;
    }

    res.json({
      card: toCard({ ...card, box: next.box, dueAt: next.dueAt }),
      stats: await getStats(subject.id),
    });
  }),
);

flashcardsRouter.delete<CardParams>(
  "/:cardId",
  safe(async (req, res) => {
    const subject = await getOwnedSubject(req.params.subjectId, req.userId!);
    if (!subject || !isUuid(req.params.cardId)) {
      res.status(404).json({ error: "Tarjeta no encontrada" });
      return;
    }
    const removed = await db
      .delete(flashcards)
      .where(and(eq(flashcards.id, req.params.cardId), eq(flashcards.subjectId, subject.id)))
      .returning({ id: flashcards.id });
    if (removed.length === 0) {
      res.status(404).json({ error: "Tarjeta no encontrada" });
      return;
    }
    res.json({ deleted: true });
  }),
);
