import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { generationJobs, materials, users } from "../db/schema.js";
import { getLimits, limitReachedBody, type PlanLimits } from "../limits.js";
import { countUsageLastDay, recordUsage, refundUsage } from "../usage.js";

export type GenerationKind = "preguntas" | "tarjetas";

export const ACTIVE_STATUSES = ["pendiente", "procesando"];

const KINDS: Record<
  GenerationKind,
  { defaultCount: number; maxLimit: keyof PlanLimits; plural: string; notReady: string; busy: string }
> = {
  preguntas: {
    defaultCount: 5,
    maxLimit: "maxQuestionsPerGeneration",
    plural: "preguntas",
    notReady: "El material todavía no está listo para generar preguntas",
    busy: "Ya se están generando preguntas de este material",
  },
  tarjetas: {
    defaultCount: 10,
    maxLimit: "maxFlashcardsPerGeneration",
    plural: "tarjetas",
    notReady: "El material todavía no está listo para generar tarjetas",
    busy: "Ya se están generando tarjetas de este material",
  },
};

export interface EnqueueResult {
  status: number;
  body: unknown;
}

/**
 * Encola una generación (preguntas o tarjetas) de un material "listo" y devuelve la respuesta HTTP
 * (202 con el trabajo). Gasta una generación de la cuota diaria, compartida entre ambos tipos; si el
 * modelo falla, el worker la devuelve. Un solo trabajo activo por material, sea del tipo que sea.
 */
export async function enqueueGeneration(input: {
  userId: string;
  subjectId: string;
  materialId: string;
  kind: GenerationKind;
  count?: number;
}): Promise<EnqueueResult> {
  const cfg = KINDS[input.kind];
  const count = input.count ?? cfg.defaultCount;

  const material = await db.query.materials.findFirst({
    where: and(eq(materials.id, input.materialId), eq(materials.subjectId, input.subjectId)),
  });
  if (!material) return { status: 404, body: { error: "Material no encontrado" } };
  if (material.status !== "listo") return { status: 409, body: { error: cfg.notReady } };

  const user = await db.query.users.findFirst({ where: eq(users.id, input.userId) });
  const limits = getLimits(user?.plan ?? "free");
  const maxPerGeneration = limits[cfg.maxLimit];
  if (count > maxPerGeneration) {
    return limitReachedBody(
      cfg.maxLimit,
      `Tu plan permite hasta ${maxPerGeneration} ${cfg.plural} por generación`,
      maxPerGeneration,
    );
  }
  const usedToday = await countUsageLastDay(input.userId, "ai_generation");
  if (usedToday >= limits.aiGenerationsPerDay) {
    return limitReachedBody(
      "aiGenerationsPerDay",
      `Ya usaste tus ${limits.aiGenerationsPerDay} generaciones de hoy`,
      limits.aiGenerationsPerDay,
    );
  }

  // Un solo trabajo activo por material: evita el doble clic y cuota gastada dos veces.
  const active = await db.query.generationJobs.findFirst({
    where: and(eq(generationJobs.materialId, material.id), inArray(generationJobs.status, ACTIVE_STATUSES)),
  });
  if (active) {
    const what = active.kind === input.kind ? cfg.busy : "Ya se está generando contenido de este material";
    return { status: 409, body: { error: what, job: active } };
  }

  // La cuota se reserva al encolar para que solicitudes simultáneas no se cuelen.
  const usageEventId = await recordUsage(input.userId, "ai_generation");
  try {
    const [job] = await db
      .insert(generationJobs)
      .values({
        subjectId: input.subjectId,
        materialId: material.id,
        userId: input.userId,
        kind: input.kind,
        count,
        usageEventId,
      })
      .returning();
    return { status: 202, body: { job } };
  } catch (err) {
    await refundUsage(usageEventId).catch(() => {});
    throw err;
  }
}
