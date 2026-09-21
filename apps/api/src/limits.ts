import type { Response } from "express";

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
  /** Preguntas máximas que se pueden pedir en una sola generación. */
  maxQuestionsPerGeneration: number;
  /** Tarjetas máximas que se pueden pedir en una sola generación. */
  maxFlashcardsPerGeneration: number;
  /** Preguntas al tutor por día (ventana móvil de 24 h). Cada respuesta es una llamada a la IA. */
  tutorMessagesPerDay: number;
  /** Mensajes máximos por conversación del tutor (preguntas y respuestas): acota el costo del historial. */
  maxMessagesPerConversation: number;
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
    maxQuestionsPerGeneration: 10,
    maxFlashcardsPerGeneration: 15,
    tutorMessagesPerDay: 20,
    maxMessagesPerConversation: 40,
    ocrImagesPerDay: 5,
  },
};

export function getLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan as Plan] ?? PLAN_LIMITS.free;
}

/**
 * Respuesta uniforme cuando se supera un límite: `code` fijo y `limit` con el nombre
 * del límite, para que el frontend pueda mostrar el mensaje o el aviso de mejorar plan.
 * 413 para tamaño de archivo, 429 para cuotas diarias, 403 para el resto.
 */
export function limitReachedBody(limit: keyof PlanLimits, message: string, max: number) {
  const status = limit === "maxFileBytes" ? 413 : limit.endsWith("PerDay") ? 429 : 403;
  return { status, body: { error: message, code: "LIMIT_REACHED", limit, max } };
}

export function limitReached(
  res: Response,
  limit: keyof PlanLimits,
  message: string,
  max: number,
): void {
  const { status, body } = limitReachedBody(limit, message, max);
  res.status(status).json(body);
}
