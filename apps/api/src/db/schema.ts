import { relations } from "drizzle-orm";
import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
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

/** Fase 1 solo usa type = "text" (texto pegado). PDF/imagen se suman en Fase 2. */
export const materials = pgTable("materials", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => subjects.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("listo"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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

export const usersRelations = relations(users, ({ many }) => ({
  subjects: many(subjects),
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
