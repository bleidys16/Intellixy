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
    /** Preguntas pedidas. */
    count: integer("count").notNull(),
    /** Evento de cuota reservado al encolar; se reembolsa si el trabajo falla. Sin FK: el reembolso lo borra. */
    usageEventId: uuid("usage_event_id"),
    /** Resultado: preguntas guardadas, descartadas por cita no verificable, y si el material se muestreó. */
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
