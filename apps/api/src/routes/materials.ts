import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { generateQuestions } from "../ai/generateQuestions.js";
import { requireAuth } from "../auth/middleware.js";
import { db } from "../db/client.js";
import { materialChunks, materials, questions, subjects, topics } from "../db/schema.js";

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
