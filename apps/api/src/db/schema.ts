import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  /** Plan de suscripción; define los límites en `limits.ts`. Hoy solo existe "free". */
  plan: text("plan").notNull().default("free"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const subjects = pgTable("subjects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color"),
  examDate: timestamp("exam_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * type: "text" | "pdf" | "image".
 * status: "pendiente" → "procesando" → "listo" | "error". El texto pegado nace "listo".
 * Los materiales "pendiente" son la cola de trabajos que consume el worker.
 */
export const materials = pgTable("materials", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => subjects.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("pendiente"),
  /** Clave del archivo en el almacenamiento; null para texto pegado. */
  storagePath: text("storage_path"),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  pageCount: integer("page_count"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const materialChunks = pgTable("material_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  materialId: uuid("material_id")
    .notNull()
    .references(() => materials.id, { onDelete: "cascade" }),
  page: integer("page").notNull(),
  text: text("text").notNull(),
});

export const topics = pgTable(
  "topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (table) => ({
    subjectNameIdx: uniqueIndex("topics_subject_id_name_idx").on(table.subjectId, table.name),
  }),
);

export const questions = pgTable("questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => subjects.id, { onDelete: "cascade" }),
  topicId: uuid("topic_id")
    .notNull()
    .references(() => topics.id),
  chunkId: uuid("chunk_id")
    .notNull()
    .references(() => materialChunks.id),
  prompt: text("prompt").notNull(),
  options: jsonb("options").notNull().$type<{ a: string; b: string; c: string; d: string }>(),
  correctOption: text("correct_option").notNull(),
  explanation: text("explanation").notNull(),
  sourceQuote: text("source_quote").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Registro de uso para cuotas por plan y control de costos.
 * kind: "ai_generation" | "ai_ocr" | "upload".
 */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userKindDateIdx: index("usage_events_user_kind_date_idx").on(
      table.userId,
      table.kind,
      table.createdAt,
    ),
  }),
);

/**
 * Cola de generación de preguntas. La IA tarda decenas de segundos, así que la petición
 * solo encola y un worker hace el trabajo; el cliente (web o Android) consulta el estado.
 * status: "pendiente" → "procesando" → "listo" | "error".
 */
export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pendiente"),
    /** Qué se genera: "preguntas" | "tarjetas". */
    kind: text("kind").notNull().default("preguntas"),
    /** Elementos pedidos (preguntas o tarjetas, según `kind`). */
    count: integer("count").notNull(),
    /** Evento de cuota reservado al encolar; se reembolsa si el trabajo falla. Sin FK: el reembolso lo borra. */
    usageEventId: uuid("usage_event_id"),
    /**
     * Resultado: elementos guardados (preguntas o tarjetas, según `kind`; el nombre viene de cuando solo
     * había preguntas), descartados por cita no verificable, y si el material se muestreó.
     */
    questionCount: integer("question_count").notNull().default(0),
    discarded: integer("discarded").notNull().default(0),
    sampled: boolean("sampled").notNull().default(false),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    subjectStatusIdx: index("generation_jobs_subject_status_idx").on(table.subjectId, table.status),
    statusCreatedIdx: index("generation_jobs_status_created_idx").on(table.status, table.createdAt),
  }),
);

/**
 * Un intento de quiz sobre las preguntas ya generadas de una materia (no gasta IA).
 * status: "en_curso" → "terminado". `score` queda en null hasta terminar.
 */
export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("en_curso"),
    /** Preguntas del intento (se fijan al crearlo). */
    total: integer("total").notNull(),
    /** Aciertos; null mientras el intento está en curso. */
    score: integer("score"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
  },
  (table) => ({
    subjectUserIdx: index("quiz_attempts_subject_user_idx").on(table.subjectId, table.userId, table.createdAt),
  }),
);

/**
 * Una fila por pregunta del intento, creada al empezar con `givenAnswer` en null.
 * Responder la actualiza. Es la base de la analítica de dominio por tema (fase 4).
 * Si se borra la pregunta (al borrar su material) desaparece también su respuesta.
 */
export const attemptAnswers = pgTable(
  "attempt_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => quizAttempts.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    /** Orden de la pregunta dentro del intento. */
    position: integer("position").notNull(),
    /** "a" | "b" | "c" | "d"; null si todavía no se respondió. */
    givenAnswer: text("given_answer"),
    isCorrect: boolean("is_correct"),
    /** Segundos que tardó, medidos por el cliente. */
    seconds: integer("seconds"),
    answeredAt: timestamp("answered_at"),
  },
  (table) => ({
    attemptQuestionIdx: uniqueIndex("attempt_answers_attempt_question_idx").on(table.attemptId, table.questionId),
    questionIdx: index("attempt_answers_question_idx").on(table.questionId),
  }),
);

/**
 * Tarjeta de estudio generada del material; apunta a su fuente (fragmento + cita).
 * `box` y `dueAt` son el estado Leitner actual (caja 1-5 y cuándo toca repasarla): se guardan aquí
 * para consultar "pendientes" sin recorrer el historial, que vive en `flashcard_reviews`.
 * Al borrar el material se borran también sus tarjetas (cascade por el fragmento).
 */
export const flashcards = pgTable(
  "flashcards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id),
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => materialChunks.id, { onDelete: "cascade" }),
    front: text("front").notNull(),
    back: text("back").notNull(),
    sourceQuote: text("source_quote").notNull(),
    box: integer("box").notNull().default(1),
    dueAt: timestamp("due_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    subjectDueIdx: index("flashcards_subject_due_idx").on(table.subjectId, table.dueAt),
  }),
);

/** Historial de repasos. result: "sabia" | "dude" | "no_sabia". */
export const flashcardReviews = pgTable(
  "flashcard_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flashcardId: uuid("flashcard_id")
      .notNull()
      .references(() => flashcards.id, { onDelete: "cascade" }),
    result: text("result").notNull(),
    /** Caja en la que quedó la tarjeta después de este repaso. */
    boxAfter: integer("box_after").notNull(),
    reviewedAt: timestamp("reviewed_at").notNull().defaultNow(),
    nextDueAt: timestamp("next_due_at").notNull(),
  },
  (table) => ({
    flashcardIdx: index("flashcard_reviews_flashcard_idx").on(table.flashcardId, table.reviewedAt),
  }),
);

export const flashcardsRelations = relations(flashcards, ({ one, many }) => ({
  subject: one(subjects, { fields: [flashcards.subjectId], references: [subjects.id] }),
  topic: one(topics, { fields: [flashcards.topicId], references: [topics.id] }),
  chunk: one(materialChunks, { fields: [flashcards.chunkId], references: [materialChunks.id] }),
  reviews: many(flashcardReviews),
}));

export const flashcardReviewsRelations = relations(flashcardReviews, ({ one }) => ({
  flashcard: one(flashcards, { fields: [flashcardReviews.flashcardId], references: [flashcards.id] }),
}));

/** Una conversación del tutor sobre una materia. El título sale de la primera pregunta. */
export const tutorConversations = pgTable(
  "tutor_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    subjectUserIdx: index("tutor_conversations_subject_user_idx").on(table.subjectId, table.userId, table.updatedAt),
  }),
);

/** Cita verificada de una respuesta del tutor: se guarda una copia, así sigue legible aunque se borre el material. */
export interface TutorCitation {
  /** Número que aparece como [n] en el texto de la respuesta. */
  ref: number;
  quote: string;
  page: number;
  materialId: string;
  materialName: string;
  materialType: string;
}

/**
 * Mensajes de la conversación. Las preguntas del estudiante (role "user") nacen "listo". Las respuestas
 * (role "assistant") nacen "pendiente" y un worker las completa; son la cola del tutor, igual que
 * `generation_jobs` para las generaciones.
 *
 * outcome (solo respuestas "listo"): "grounded" = respaldada por citas verificadas; "not_in_material" = el tema
 * no aparece en los apuntes; "unverified" = el modelo dijo que sí estaba pero ninguna cita se pudo comprobar.
 * `general` es conocimiento general del modelo, sin fuente verificable, y siempre se muestra aparte y marcado.
 */
export const tutorMessages = pgTable(
  "tutor_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => tutorConversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull().default(""),
    status: text("status").notNull().default("listo"),
    outcome: text("outcome"),
    general: text("general"),
    citations: jsonb("citations").notNull().$type<TutorCitation[]>().default([]),
    errorMessage: text("error_message"),
    /** Evento de cuota reservado al preguntar; se reembolsa si la respuesta falla. Sin FK: el reembolso lo borra. */
    usageEventId: uuid("usage_event_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    conversationIdx: index("tutor_messages_conversation_idx").on(table.conversationId, table.createdAt),
    statusIdx: index("tutor_messages_status_idx").on(table.status, table.createdAt),
  }),
);

export const tutorConversationsRelations = relations(tutorConversations, ({ many }) => ({
  messages: many(tutorMessages),
}));

export const tutorMessagesRelations = relations(tutorMessages, ({ one }) => ({
  conversation: one(tutorConversations, {
    fields: [tutorMessages.conversationId],
    references: [tutorConversations.id],
  }),
}));

export const quizAttemptsRelations = relations(quizAttempts, ({ many }) => ({
  answers: many(attemptAnswers),
}));

export const attemptAnswersRelations = relations(attemptAnswers, ({ one }) => ({
  attempt: one(quizAttempts, { fields: [attemptAnswers.attemptId], references: [quizAttempts.id] }),
  question: one(questions, { fields: [attemptAnswers.questionId], references: [questions.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  subjects: many(subjects),
  usageEvents: many(usageEvents),
}));

export const usageEventsRelations = relations(usageEvents, ({ one }) => ({
  user: one(users, { fields: [usageEvents.userId], references: [users.id] }),
}));

export const subjectsRelations = relations(subjects, ({ one, many }) => ({
  user: one(users, { fields: [subjects.userId], references: [users.id] }),
  materials: many(materials),
  topics: many(topics),
  questions: many(questions),
}));

export const materialsRelations = relations(materials, ({ one, many }) => ({
  subject: one(subjects, { fields: [materials.subjectId], references: [subjects.id] }),
  chunks: many(materialChunks),
}));

export const materialChunksRelations = relations(materialChunks, ({ one, many }) => ({
  material: one(materials, { fields: [materialChunks.materialId], references: [materials.id] }),
  questions: many(questions),
}));

export const topicsRelations = relations(topics, ({ one, many }) => ({
  subject: one(subjects, { fields: [topics.subjectId], references: [subjects.id] }),
  questions: many(questions),
}));

export const questionsRelations = relations(questions, ({ one }) => ({
  subject: one(subjects, { fields: [questions.subjectId], references: [subjects.id] }),
  topic: one(topics, { fields: [questions.topicId], references: [topics.id] }),
  chunk: one(materialChunks, { fields: [questions.chunkId], references: [materialChunks.id] }),
}));
