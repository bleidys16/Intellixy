/**
 * Límites por plan. Único lugar donde viven estos números: las rutas nunca los
 * escriben a mano, así cambiar un límite o crear un plan nuevo es tocar solo este archivo.
 * Los valores del plan "free" son provisionales.
 */
export type Plan = "free";

export interface PlanLimits {
  /** Tamaño máximo por archivo subido, en bytes. */
  maxFileBytes: number;
  /** Páginas máximas por PDF. */
  maxPdfPages: number;
  /** Materiales máximos por materia. */
  maxMaterialsPerSubject: number;
  /** Almacenamiento total por usuario, en bytes. */
  maxStorageBytes: number;
  /** Generaciones de preguntas por día (ventana móvil de 24 h). */
  aiGenerationsPerDay: number;
  /** Imágenes procesadas con OCR por día (ventana móvil de 24 h). */
  ocrImagesPerDay: number;
}

const MB = 1024 * 1024;

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxFileBytes: 10 * MB,
    maxPdfPages: 50,
    maxMaterialsPerSubject: 10,
    maxStorageBytes: 100 * MB,
    aiGenerationsPerDay: 5,
    ocrImagesPerDay: 5,
  },
};

export function getLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan as Plan] ?? PLAN_LIMITS.free;
}
