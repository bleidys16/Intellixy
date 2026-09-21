import { eq, sql } from "drizzle-orm";
import type { MaterialBlock } from "../ai/types.js";
import { db } from "../db/client.js";
import { materialChunks, materials, subjects, users } from "../db/schema.js";
import { ExtractionError } from "../extraction/errors.js";
import { extractImage } from "../extraction/extractImage.js";
import { extractPdf } from "../extraction/extractPdf.js";
import { getLimits } from "../limits.js";
import { storage } from "../storage/index.js";

const POLL_INTERVAL_MS = 3000;

type Material = typeof materials.$inferSelect;

/**
 * Worker de extracción. La cola es la propia tabla `materials`: los que están en
 * "pendiente" esperan turno. Cada material se reclama con FOR UPDATE SKIP LOCKED,
 * así dos procesos del API nunca toman el mismo. Procesa de a uno: el cuello de
 * botella es la llamada a la IA (OCR), y así también se acota el uso de memoria.
 */
export function startMaterialWorker(): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  async function tick() {
    if (stopped) return;
    let idle = true;
    try {
      const material = await claimNext();
      if (material) {
        idle = false;
        await processMaterial(material);
      }
    } catch (err) {
      console.error("[worker] error en el ciclo:", err);
    }
    // Si había trabajo se vuelve a consultar de inmediato; si no, se espera.
    if (!stopped) timer = setTimeout(tick, idle ? POLL_INTERVAL_MS : 0);
  }

  void recoverInterrupted()
    .catch((err) => console.error("[worker] no se pudo recuperar materiales interrumpidos:", err))
    .finally(() => {
      if (!stopped) void tick();
    });

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

/**
 * Un material en "procesando" al arrancar es uno que se cortó porque el API se cayó
 * o se reinició a la mitad. Se devuelve a la cola. Supone un solo proceso del API;
 * con varios habría que distinguir los que de verdad siguen en curso.
 */
async function recoverInterrupted() {
  const recovered = await db
    .update(materials)
    .set({ status: "pendiente", updatedAt: new Date() })
    .where(eq(materials.status, "procesando"))
    .returning({ id: materials.id });
  if (recovered.length > 0) {
    console.log(`[worker] ${recovered.length} material(es) interrumpido(s) vuelven a la cola`);
  }
}

async function claimNext(): Promise<Material | null> {
  const claimed = await db.execute<{ id: string }>(sql`
    update materials
    set status = 'procesando', error_message = null, updated_at = now()
    where id = (
      select id from materials
      where status = 'pendiente'
      order by created_at
      limit 1
      for update skip locked
    )
    returning id
  `);
  const id = claimed.rows[0]?.id;
  if (!id) return null;
  return (await db.query.materials.findFirst({ where: eq(materials.id, id) })) ?? null;
}

async function processMaterial(material: Material) {
  const started = Date.now();
  try {
    if (!material.storagePath) {
      throw new ExtractionError("El material no tiene un archivo asociado");
    }
    const data = await storage.read(material.storagePath);

    let pageCount: number;
    let pages: MaterialBlock[];
    if (material.type === "pdf") {
      const owner = await getOwnerPlan(material.subjectId);
      ({ pageCount, pages } = await extractPdf(data, getLimits(owner).maxPdfPages));
    } else if (material.type === "image") {
      pages = await extractImage(data);
      pageCount = 1;
    } else {
      throw new ExtractionError(`Tipo de material no soportado: ${material.type}`);
    }

    // Chunks y estado en una sola transacción: nunca queda "listo" sin sus fragmentos.
    // El delete previo hace idempotente el reintento de un material que ya falló.
    await db.transaction(async (tx) => {
      await tx.delete(materialChunks).where(eq(materialChunks.materialId, material.id));
      await tx
        .insert(materialChunks)
        .values(pages.map((p) => ({ materialId: material.id, page: p.page, text: p.text })));
      await tx
        .update(materials)
        .set({ status: "listo", pageCount, errorMessage: null, updatedAt: new Date() })
        .where(eq(materials.id, material.id));
    });
    console.log(
      `[worker] "${material.name}" listo: ${pages.length} fragmento(s) en ${Date.now() - started} ms`,
    );
  } catch (err) {
    const message =
      err instanceof ExtractionError
        ? err.message
        : "No se pudo procesar el archivo. Inténtalo de nuevo más tarde";
    if (!(err instanceof ExtractionError)) {
      console.error(`[worker] falló el material ${material.id}:`, err);
    }
    await db
      .update(materials)
      .set({ status: "error", errorMessage: message, updatedAt: new Date() })
      .where(eq(materials.id, material.id));
  }
}

async function getOwnerPlan(subjectId: string): Promise<string> {
  const [row] = await db
    .select({ plan: users.plan })
    .from(subjects)
    .innerJoin(users, eq(subjects.userId, users.id))
    .where(eq(subjects.id, subjectId));
  return row?.plan ?? "free";
}
