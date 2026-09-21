export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Subject {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  examDate: string | null;
  createdAt: string;
}

export interface Question {
  id: string;
  subjectId: string;
  topicId: string;
  chunkId: string;
  prompt: string;
  options: { a: string; b: string; c: string; d: string };
  correctOption: "a" | "b" | "c" | "d";
  explanation: string;
  sourceQuote: string;
  createdAt: string;
  topic?: { id: string; name: string };
  /** Material de origen de la pregunta (para agruparlas por material). */
  material: { id: string; name: string; type: "text" | "pdf" | "image" };
}

export type MaterialStatus = "pendiente" | "procesando" | "listo" | "error";

export interface Material {
  id: string;
  subjectId: string;
  type: "text" | "pdf" | "image";
  name: string;
  status: MaterialStatus;
  mimeType: string | null;
  sizeBytes: number;
  pageCount: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialChunk {
  id: string;
  page: number;
  text: string;
}

export type GenerationStatus = "pendiente" | "procesando" | "listo" | "error";

/** Trabajo de generación de preguntas: la API responde al instante y esto se consulta hasta que termine. */
export interface GenerationJob {
  id: string;
  subjectId: string;
  materialId: string;
  status: GenerationStatus;
  count: number;
  /** Preguntas guardadas (cuando status = "listo"). */
  questionCount: number;
  /** Preguntas que el modelo devolvió pero no pasaron la verificación de cita. */
  discarded: number;
  /** true si el material era muy largo y solo se usó una parte. */
  sampled: boolean;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}
