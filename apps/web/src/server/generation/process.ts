import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { generationJobs, materials } from "../db/schema";
import { generateFlashcardsForMaterial } from "../flashcards/generateForMaterial";
import { generateForMaterial } from "../questions/generateForMaterial";
import { refundUsage } from "../usage";

type Job = typeof generationJobs.$inferSelect;

async function fail(job: Job, message: string) {
  // Si el modelo falla, el usuario no pierde la generación de su cuota diaria.
  if (job.usageEventId) await refundUsage(job.usageEventId).catch(() => {});
  await db
    .update(generationJobs)
    .set({ status: "error", errorMessage: message, updatedAt: new Date() })
    .where(eq(generationJobs.id, job.id));
}

/**
 * Procesa un trabajo de generación (preguntas o tarjetas) en segundo plano. Se reclama de forma atómica
 * (pendiente → procesando) para que dos invocaciones no lo procesen a la vez, y siempre termina en
 * "listo" o "error".
 */
export async function processGenerationJob(jobId: string): Promise<void> {
  const [job] = await db
    .update(generationJobs)
    .set({ status: "procesando", errorMessage: null, updatedAt: new Date() })
    .where(and(eq(generationJobs.id, jobId), eq(generationJobs.status, "pendiente")))
    .returning();
  if (!job) return;

  try {
    const material = await db.query.materials.findFirst({ where: eq(materials.id, job.materialId) });
    if (!material || material.status !== "listo") {
      await fail(job, "El material ya no está disponible para generar contenido");
      return;
    }

    const target = { id: material.id, name: material.name, type: material.type };
    const outcome =
      job.kind === "tarjetas"
        ? await generateFlashcardsForMaterial({ subjectId: job.subjectId, material: target, count: job.count }).then(
            (r) => ({ saved: r.created, discarded: r.discarded, sampled: r.sampled }),
          )
        : await generateForMaterial({ subjectId: job.subjectId, material: target, count: job.count }).then((r) => ({
            saved: r.questions.length,
            discarded: r.discarded,
            sampled: r.sampled,
          }));

    if (outcome.saved === 0) {
      const what = job.kind === "tarjetas" ? "ninguna tarjeta válida" : "ninguna pregunta válida";
      await fail(job, `El modelo no produjo ${what} con cita verificable. Inténtalo de nuevo`);
      return;
    }
    await db
      .update(generationJobs)
      .set({
        status: "listo",
        questionCount: outcome.saved,
        discarded: outcome.discarded,
        sampled: outcome.sampled,
        updatedAt: new Date(),
      })
      .where(eq(generationJobs.id, job.id));
  } catch (err) {
    console.error(`[generación] falló el trabajo ${job.id}:`, err);
    await fail(job, `No se pudieron generar ${job.kind === "tarjetas" ? "tarjetas" : "preguntas"} con el modelo de IA. Inténtalo de nuevo`).catch(
      () => {},
    );
  }
}
