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

export interface GenerationResult {
  questions: Question[];
  /** Preguntas que el modelo devolvió pero no pasaron la verificación de cita. */
  discarded: number;
  /** true si el material era muy largo y solo se usó una parte. */
  sampled: boolean;
}
