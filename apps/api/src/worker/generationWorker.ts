import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { generationJobs, materials } from "../db/schema.js";
import { generateFlashcardsForMaterial } from "../flashcards/generateForMaterial.js";
import { generateForMaterial } from "../questions/generateForMaterial.js";
import { refundUsage } from "../usage.js";

const POLL_INTERVAL_MS = 2000;
/** Generaciones simultáneas. Cada una es una llamada larga a la IA; se acota para no chocar con sus límites. */
const CONCURRENCY = Number(process.env.GENERATION_CONCURRENCY ?? 2);

type Job = typeof generationJobs.$inferSelect;

/**
 * Worker de generación (preguntas y tarjetas). La cola es la tabla `generation_jobs`: los "pendiente"
 * esperan turno y cada trabajo se reclama con FOR UPDATE SKIP LOCKED, igual que en el worker
 * de materiales. Corren varios ciclos en paralelo (CONCURRENCY) porque el tiempo se va en esperar al modelo.
 */
export function startGenerationWorker(): () => void {
  let stopped = false;
  const timers = new Set<NodeJS.Timeout>();

  function loop() {
    async function tick() {
      if (stopped) return;
      let idle = true;
      try {
        const job = await claimNext();
        if (job) {
          idle = false;
          await processJob(job);
        }
      } catch (err) {
        console.error("[generación] error en el ciclo:", err);
      }
      if (!stopped) {
        const t = setTimeout(() => {
          timers.delete(t);
          void tick();
        }, idle ? POLL_INTERVAL_MS : 0);
        timers.add(t);
      }
    }
    void tick();
  }

  void recoverInterrupted()
    .catch((err) => console.error("[generación] no se pudo recuperar trabajos interrumpidos:", err))
    .finally(() => {
      if (stopped) return;
      for (let i = 0; i < CONCURRENCY; i++) loop();
    });

  return () => {
    stopped = true;
    timers.forEach(clearTimeout);
  };
}

/** Un trabajo en "procesando" al arrancar se cortó porque el API se reinició: vuelve a la cola. */
async function recoverInterrupted() {
  const recovered = await db
    .update(generationJobs)
    .set({ status: "pendiente", updatedAt: new Date() })
    .where(eq(generationJobs.status, "procesando"))
    .returning({ id: generationJobs.id });
  if (recovered.length > 0) {
    console.log(`[generación] ${recovered.length} trabajo(s) interrumpido(s) vuelven a la cola`);
  }
}

async function claimNext(): Promise<Job | null> {
  const claimed = await db.execute<{ id: string }>(sql`
    update generation_jobs
    set status = 'procesando', error_message = null, updated_at = now()
    where id = (
      select id from generation_jobs
      where status = 'pendiente'
      order by created_at
      limit 1
      for update skip locked
    )
    returning id
  `);
  const id = claimed.rows[0]?.id;
  if (!id) return null;
  return (await db.query.generationJobs.findFirst({ where: eq(generationJobs.id, id) })) ?? null;
}

async function fail(job: Job, message: string) {
  // Si el modelo falla, el usuario no pierde la generación de su cuota diaria.
  if (job.usageEventId) await refundUsage(job.usageEventId).catch(() => {});
  await db
    .update(generationJobs)
    .set({ status: "error", errorMessage: message, updatedAt: new Date() })
    .where(eq(generationJobs.id, job.id));
}

async function processJob(job: Job) {
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
    await fail(job, `No se pudieron generar ${job.kind === "tarjetas" ? "tarjetas" : "preguntas"} con el modelo de IA. Inténtalo de nuevo`);
  }
}
