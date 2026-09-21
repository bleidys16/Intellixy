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

export type OptionLetter = "a" | "b" | "c" | "d";

export interface QuizAttempt {
  id: string;
  subjectId: string;
  status: "en_curso" | "terminado";
  total: number;
  /** Aciertos; null mientras el intento está en curso. */
  score: number | null;
  createdAt: string;
  finishedAt: string | null;
}

/** Fila del historial: el intento y cuántas preguntas lleva respondidas. */
export interface QuizSummary extends QuizAttempt {
  answered: number;
}

export interface QuizSource {
  quote: string;
  page: number;
  materialId: string;
  materialName: string;
}

/** Lo que la API revela solo después de responder. */
export interface QuizResult {
  givenAnswer: OptionLetter | null;
  isCorrect: boolean | null;
  correctOption: OptionLetter;
  explanation: string;
  source: QuizSource;
}

export interface QuizItem {
  position: number;
  question: {
    id: string;
    prompt: string;
    options: Record<OptionLetter, string>;
    topic: { id: string; name: string };
    material: { id: string; name: string; type: "text" | "pdf" | "image" };
  };
  answered: boolean;
  result: QuizResult | null;
}

export interface QuizAnswerResponse {
  result: QuizResult;
  attempt: QuizAttempt;
  remaining: number;
}
