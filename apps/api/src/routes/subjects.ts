import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { db } from "../db/client.js";
import { questions, subjects } from "../db/schema.js";

export const subjectsRouter = Router();
subjectsRouter.use(requireAuth);

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
