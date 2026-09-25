/**
 * Crea (o recrea) una cuenta de demostración con materias, preguntas, tarjetas e historial de estudio,
 * para no empezar de cero cada vez que se prueba la interfaz.
 *
 * Uso: `npm run db:seed-demo`. Credenciales en `.env`: DEMO_NAME, DEMO_EMAIL, DEMO_PASSWORD.
 * Si la cuenta ya existe se conserva, pero SUS MATERIAS SE BORRAN Y SE VUELVEN A CREAR.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { hashPassword } from "../auth/password.js";
import { MAX_BOX } from "../flashcards/leitner.js";
import { db } from "./client.js";
import * as s from "./schema.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);

interface QuestionSeed {
  prompt: string;
  /** Cuatro opciones en orden a, b, c, d. */
  options: [string, string, string, string];
  correct: "a" | "b" | "c" | "d";
  explanation: string;
  quote: string;
}

interface CardSeed {
  front: string;
  back: string;
  quote: string;
  box: number;
  /** Días hasta que vence; cero o negativo = ya toca repasarla. */
  dueInDays: number;
  /** Repasos previos, del más antiguo al más reciente, con hace cuántos días ocurrieron. */
  history?: Array<{ result: "sabia" | "dude" | "no_sabia"; daysAgo: number }>;
}

interface TopicSeed {
  name: string;
  /** Índice del fragmento (página - 1) del que salen sus preguntas y tarjetas. */
  chunk: number;
  questions: QuestionSeed[];
  cards: CardSeed[];
}

interface SubjectSeed {
  name: string;
  color: string;
  materialName: string;
  chunks: string[];
  topics: TopicSeed[];
}

const SUBJECTS: SubjectSeed[] = [
  {
    name: "Biología celular",
    color: "#8CA7F4",
    materialName: "Apuntes de biología celular",
    chunks: [
      "La membrana plasmática es una bicapa de fosfolípidos con proteínas incrustadas que controla qué sustancias entran y salen de la célula. Su carácter selectivo se debe a que las moléculas pequeñas y apolares la atraviesan con facilidad, mientras que los iones necesitan canales o transportadores. El transporte pasivo no gasta energía y va a favor del gradiente de concentración; el transporte activo sí gasta ATP y va en contra del gradiente.",
      "La mitocondria es el orgánulo donde se produce la mayor parte del ATP mediante la respiración celular. El núcleo contiene el ADN y coordina la actividad de la célula. Los ribosomas sintetizan proteínas y pueden estar libres en el citoplasma o unidos al retículo endoplasmático rugoso. El aparato de Golgi modifica, empaqueta y distribuye las proteínas y lípidos hacia su destino.",
      "La mitosis es el proceso por el cual una célula se divide en dos células hijas genéticamente idénticas. Sus fases son profase, metafase, anafase y telofase. En la metafase los cromosomas se alinean en el plano ecuatorial de la célula. En la anafase las cromátidas hermanas se separan hacia polos opuestos. La meiosis, en cambio, produce cuatro células haploides y es la base de la formación de gametos.",
    ],
    topics: [
      {
        name: "Membrana celular",
        chunk: 0,
        questions: [
          {
            prompt: "¿Qué estructura forma la membrana plasmática?",
            options: ["Una bicapa de fosfolípidos con proteínas incrustadas", "Una pared rígida de celulosa", "Una capa simple de proteínas", "Una red de filamentos de actina"],
            correct: "a",
            explanation: "Los apuntes describen la membrana como una bicapa de fosfolípidos con proteínas incrustadas.",
            quote: "La membrana plasmática es una bicapa de fosfolípidos con proteínas incrustadas",
          },
          {
            prompt: "¿Qué tipo de transporte gasta ATP y va en contra del gradiente?",
            options: ["Difusión simple", "Transporte activo", "Ósmosis", "Transporte pasivo"],
            correct: "b",
            explanation: "Solo el transporte activo consume ATP y va en contra del gradiente.",
            quote: "el transporte activo sí gasta ATP y va en contra del gradiente",
          },
          {
            prompt: "¿Qué moléculas atraviesan la membrana con facilidad?",
            options: ["Los iones", "Las proteínas grandes", "Las moléculas pequeñas y apolares", "Los polisacáridos"],
            correct: "c",
            explanation: "Las moléculas pequeñas y apolares pasan con facilidad; los iones necesitan canales o transportadores.",
            quote: "las moléculas pequeñas y apolares la atraviesan con facilidad",
          },
          {
            prompt: "El transporte pasivo se caracteriza porque…",
            options: ["Gasta ATP", "Va en contra del gradiente", "Solo ocurre con iones", "Va a favor del gradiente de concentración"],
            correct: "d",
            explanation: "El transporte pasivo no gasta energía y va a favor del gradiente de concentración.",
            quote: "va a favor del gradiente de concentración",
          },
        ],
        cards: [
          {
            front: "¿Qué diferencia hay entre transporte pasivo y activo?",
            back: "El pasivo va a favor del gradiente y no gasta energía; el activo va en contra del gradiente y gasta ATP.",
            quote: "El transporte pasivo no gasta energía y va a favor del gradiente de concentración",
            box: 4,
            dueInDays: 5,
            history: [{ result: "no_sabia", daysAgo: 12 }, { result: "sabia", daysAgo: 10 }, { result: "sabia", daysAgo: 6 }],
          },
          {
            front: "¿Por qué la membrana es selectiva?",
            back: "Porque deja pasar con facilidad moléculas pequeñas y apolares, mientras que los iones necesitan canales o transportadores.",
            quote: "Su carácter selectivo se debe a que las moléculas pequeñas y apolares la atraviesan con facilidad",
            box: 5,
            dueInDays: 11,
            history: [{ result: "sabia", daysAgo: 13 }, { result: "sabia", daysAgo: 12 }, { result: "sabia", daysAgo: 8 }, { result: "sabia", daysAgo: 5 }],
          },
        ],
      },
      {
        name: "Orgánulos",
        chunk: 1,
        questions: [
          {
            prompt: "¿En qué orgánulo se produce la mayor parte del ATP?",
            options: ["Aparato de Golgi", "Núcleo", "Mitocondria", "Ribosoma"],
            correct: "c",
            explanation: "La mitocondria produce la mayor parte del ATP mediante la respiración celular.",
            quote: "La mitocondria es el orgánulo donde se produce la mayor parte del ATP",
          },
          {
            prompt: "¿Qué orgánulo contiene el ADN de la célula?",
            options: ["El núcleo", "La mitocondria", "El ribosoma", "El aparato de Golgi"],
            correct: "a",
            explanation: "El núcleo contiene el ADN y coordina la actividad de la célula.",
            quote: "El núcleo contiene el ADN",
          },
          {
            prompt: "¿Qué sintetizan los ribosomas?",
            options: ["Lípidos", "Proteínas", "Glucosa", "ATP"],
            correct: "b",
            explanation: "Los ribosomas sintetizan proteínas, libres o unidos al retículo endoplasmático rugoso.",
            quote: "Los ribosomas sintetizan proteínas",
          },
          {
            prompt: "¿Qué función tiene el aparato de Golgi?",
            options: ["Producir ATP", "Almacenar el ADN", "Sintetizar proteínas", "Modificar, empaquetar y distribuir proteínas y lípidos"],
            correct: "d",
            explanation: "El aparato de Golgi modifica, empaqueta y distribuye proteínas y lípidos hacia su destino.",
            quote: "El aparato de Golgi modifica, empaqueta y distribuye las proteínas y lípidos",
          },
        ],
        cards: [
          {
            front: "¿Qué hace el aparato de Golgi?",
            back: "Modifica, empaqueta y distribuye las proteínas y lípidos hacia su destino.",
            quote: "El aparato de Golgi modifica, empaqueta y distribuye las proteínas y lípidos hacia su destino",
            box: 1,
            dueInDays: -2,
            history: [{ result: "dude", daysAgo: 4 }, { result: "no_sabia", daysAgo: 3 }],
          },
          {
            front: "¿Dónde pueden estar los ribosomas?",
            back: "Libres en el citoplasma o unidos al retículo endoplasmático rugoso.",
            quote: "pueden estar libres en el citoplasma o unidos al retículo endoplasmático rugoso",
            box: 1,
            dueInDays: -1,
          },
          {
            front: "¿Qué proceso de la mitocondria produce ATP?",
            back: "La respiración celular.",
            quote: "mediante la respiración celular",
            box: 2,
            dueInDays: 1,
            history: [{ result: "no_sabia", daysAgo: 6 }, { result: "sabia", daysAgo: 1 }],
          },
        ],
      },
      {
        name: "Mitosis y meiosis",
        chunk: 2,
        questions: [
          {
            prompt: "¿Cuántas células hijas genéticamente idénticas produce la mitosis?",
            options: ["Dos", "Cuatro", "Una", "Ocho"],
            correct: "a",
            explanation: "La mitosis divide una célula en dos células hijas genéticamente idénticas.",
            quote: "se divide en dos células hijas genéticamente idénticas",
          },
          {
            prompt: "¿Qué ocurre en la metafase?",
            options: ["Las cromátidas se separan", "Los cromosomas se alinean en el plano ecuatorial", "Se forman las dos células hijas", "Se duplica el ADN"],
            correct: "b",
            explanation: "En la metafase los cromosomas se alinean en el plano ecuatorial de la célula.",
            quote: "En la metafase los cromosomas se alinean en el plano ecuatorial",
          },
          {
            prompt: "¿Qué pasa con las cromátidas hermanas en la anafase?",
            options: ["Se duplican", "Se alinean en el centro", "Se separan hacia polos opuestos", "Desaparecen"],
            correct: "c",
            explanation: "En la anafase las cromátidas hermanas se separan hacia polos opuestos.",
            quote: "En la anafase las cromátidas hermanas se separan hacia polos opuestos",
          },
          {
            prompt: "¿Qué produce la meiosis?",
            options: ["Dos células diploides", "Una célula gigante", "Cuatro células diploides", "Cuatro células haploides"],
            correct: "d",
            explanation: "La meiosis produce cuatro células haploides y es la base de la formación de gametos.",
            quote: "produce cuatro células haploides",
          },
        ],
        cards: [
          {
            front: "Nombra las fases de la mitosis en orden.",
            back: "Profase, metafase, anafase y telofase.",
            quote: "Sus fases son profase, metafase, anafase y telofase",
            box: 3,
            dueInDays: 0,
            history: [{ result: "sabia", daysAgo: 9 }, { result: "sabia", daysAgo: 5 }],
          },
        ],
      },
    ],
  },
  {
    name: "Bases de datos",
    color: "#D98CF4",
    materialName: "Resumen de SQL y modelo relacional",
    chunks: [
      "Una clave primaria identifica de forma única cada fila de una tabla y no puede contener valores nulos. Una clave foránea es una columna que referencia la clave primaria de otra tabla y mantiene la integridad referencial. La normalización reduce la redundancia de datos dividiendo la información en tablas relacionadas.",
      "SQL es el lenguaje estándar para consultar bases de datos relacionales. La sentencia SELECT recupera datos, INSERT agrega filas, UPDATE modifica filas existentes y DELETE elimina filas. Un JOIN combina filas de dos tablas a partir de una columna relacionada. INNER JOIN devuelve solo las filas que coinciden en ambas tablas, mientras que LEFT JOIN conserva todas las filas de la tabla izquierda.",
    ],
    topics: [
      {
        name: "Claves y normalización",
        chunk: 0,
        questions: [
          {
            prompt: "¿Qué hace una clave primaria?",
            options: ["Identifica de forma única cada fila de una tabla", "Referencia otra tabla", "Reduce la redundancia", "Permite valores nulos"],
            correct: "a",
            explanation: "La clave primaria identifica de forma única cada fila de una tabla.",
            quote: "identifica de forma única cada fila de una tabla",
          },
          {
            prompt: "¿Puede una clave primaria contener valores nulos?",
            options: ["Sí, uno por tabla", "Solo en tablas vacías", "No, no puede contener valores nulos", "Depende del motor"],
            correct: "c",
            explanation: "Los apuntes indican que no puede contener valores nulos.",
            quote: "no puede contener valores nulos",
          },
          {
            prompt: "¿Qué mantiene una clave foránea?",
            options: ["La normalización", "La integridad referencial", "El orden de las filas", "Los índices"],
            correct: "b",
            explanation: "La clave foránea referencia la clave primaria de otra tabla y mantiene la integridad referencial.",
            quote: "mantiene la integridad referencial",
          },
        ],
        cards: [
          {
            front: "¿Para qué sirve la normalización?",
            back: "Reduce la redundancia de datos dividiendo la información en tablas relacionadas.",
            quote: "La normalización reduce la redundancia de datos dividiendo la información en tablas relacionadas",
            box: 1,
            dueInDays: -3,
          },
          {
            front: "¿Qué es una clave foránea?",
            back: "Una columna que referencia la clave primaria de otra tabla.",
            quote: "Una clave foránea es una columna que referencia la clave primaria de otra tabla",
            box: 2,
            dueInDays: 0,
            history: [{ result: "sabia", daysAgo: 3 }],
          },
        ],
      },
      {
        name: "Consultas SQL",
        chunk: 1,
        questions: [
          {
            prompt: "¿Qué sentencia SQL recupera datos?",
            options: ["INSERT", "UPDATE", "DELETE", "SELECT"],
            correct: "d",
            explanation: "SELECT recupera datos; INSERT agrega, UPDATE modifica y DELETE elimina filas.",
            quote: "La sentencia SELECT recupera datos",
          },
          {
            prompt: "¿Qué hace UPDATE?",
            options: ["Elimina filas", "Modifica filas existentes", "Agrega filas", "Combina tablas"],
            correct: "b",
            explanation: "UPDATE modifica filas existentes.",
            quote: "UPDATE modifica filas existentes",
          },
          {
            prompt: "¿Qué devuelve un INNER JOIN?",
            options: ["Todas las filas de la tabla izquierda", "Todas las filas de ambas tablas", "Solo las filas que coinciden en ambas tablas", "Las filas sin coincidencia"],
            correct: "c",
            explanation: "INNER JOIN devuelve solo las filas que coinciden en ambas tablas.",
            quote: "INNER JOIN devuelve solo las filas que coinciden en ambas tablas",
          },
          {
            prompt: "¿Qué conserva un LEFT JOIN?",
            options: ["Todas las filas de la tabla izquierda", "Solo las coincidencias", "Todas las filas de la tabla derecha", "Ninguna fila sin coincidencia"],
            correct: "a",
            explanation: "LEFT JOIN conserva todas las filas de la tabla izquierda.",
            quote: "LEFT JOIN conserva todas las filas de la tabla izquierda",
          },
        ],
        cards: [
          {
            front: "INNER JOIN vs LEFT JOIN",
            back: "INNER JOIN devuelve solo las filas que coinciden en ambas tablas; LEFT JOIN conserva todas las filas de la tabla izquierda.",
            quote: "INNER JOIN devuelve solo las filas que coinciden en ambas tablas, mientras que LEFT JOIN conserva todas las filas de la tabla izquierda",
            box: 1,
            dueInDays: -1,
            history: [{ result: "no_sabia", daysAgo: 2 }],
          },
          {
            front: "¿Qué sentencias modifican datos?",
            back: "INSERT agrega filas, UPDATE modifica filas existentes y DELETE elimina filas.",
            quote: "INSERT agrega filas, UPDATE modifica filas existentes y DELETE elimina filas",
            box: 3,
            dueInDays: 4,
            history: [{ result: "sabia", daysAgo: 7 }, { result: "sabia", daysAgo: 4 }],
          },
        ],
      },
    ],
  },
  {
    name: "Estadística",
    color: "#DBF48C",
    materialName: "Apuntes de estadística descriptiva",
    chunks: [
      "La media aritmética es la suma de los valores dividida entre su cantidad. La mediana es el valor central cuando los datos están ordenados. La desviación estándar mide cuánto se alejan los datos de la media.",
    ],
    // Sin preguntas ni tarjetas a propósito: muestra una materia recién empezada.
    topics: [],
  },
];

/** Un intento de quiz sembrado: qué preguntas tiene, hace cuánto y cuáles acertó. */
interface AttemptSeed {
  subject: string;
  daysAgo: number;
  /** Nombre de tema → aciertos por posición (true acierto, false fallo). */
  results: Record<string, boolean[]>;
  /** Cuántas preguntas quedan sin responder (intento en curso). */
  unanswered?: number;
}

const ATTEMPTS: AttemptSeed[] = [
  { subject: "Biología celular", daysAgo: 10, results: { "Membrana celular": [true, false, true, false], Orgánulos: [false, true, false, false] } },
  { subject: "Biología celular", daysAgo: 5, results: { "Membrana celular": [true, true, true, true], Orgánulos: [true, false, false, true] } },
  {
    subject: "Biología celular",
    daysAgo: 1,
    results: { "Membrana celular": [true, true, true, true], Orgánulos: [false, true, false, false], "Mitosis y meiosis": [true, true, false, true] },
  },
  { subject: "Bases de datos", daysAgo: 6, results: { "Claves y normalización": [true, true, true], "Consultas SQL": [true, false, false, false] } },
  { subject: "Bases de datos", daysAgo: 2, results: { "Claves y normalización": [true, true, true], "Consultas SQL": [true, true, false, false] } },
  // Intento a medias: muestra el botón «Continuar» en el historial.
  { subject: "Bases de datos", daysAgo: 0, results: { "Consultas SQL": [true, true, true, true] }, unanswered: 2 },
];

async function main() {
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;
  const name = process.env.DEMO_NAME ?? "Cuenta demo";
  if (!email || !password) throw new Error("Faltan DEMO_EMAIL y DEMO_PASSWORD en el .env");
  if (password.length < 8) throw new Error("DEMO_PASSWORD debe tener al menos 8 caracteres");

  const passwordHash = await hashPassword(password);
  let user = await db.query.users.findFirst({ where: eq(s.users.email, email) });
  if (user) {
    [user] = await db.update(s.users).set({ name, passwordHash }).where(eq(s.users.id, user.id)).returning();
    await db.delete(s.subjects).where(eq(s.subjects.userId, user.id));
  } else {
    [user] = await db.insert(s.users).values({ name, email, passwordHash }).returning();
  }

  // Todo lo que se cree se indexa por nombre para poder armar los intentos después.
  const questionsByTopic = new Map<string, Array<{ id: string; correct: string }>>();
  const cardCount = { total: 0, due: 0 };
  const subjectIds = new Map<string, string>();

  for (const seed of SUBJECTS) {
    const [subject] = await db.insert(s.subjects).values({ userId: user.id, name: seed.name, color: seed.color }).returning();
    subjectIds.set(seed.name, subject.id);
    const [material] = await db
      .insert(s.materials)
      .values({ subjectId: subject.id, type: "text", name: seed.materialName, status: "listo", pageCount: seed.chunks.length })
      .returning();
    const chunks = [];
    for (const [i, text] of seed.chunks.entries()) {
      const [chunk] = await db.insert(s.materialChunks).values({ materialId: material.id, page: i + 1, text }).returning();
      chunks.push(chunk);
    }

    for (const t of seed.topics) {
      const chunk = chunks[t.chunk];
      const [topic] = await db.insert(s.topics).values({ subjectId: subject.id, name: t.name }).returning();
      const created: Array<{ id: string; correct: string }> = [];
      for (const q of t.questions) {
        if (!chunk.text.includes(q.quote)) throw new Error(`La cita no está en el fragmento: «${q.quote}»`);
        const [row] = await db
          .insert(s.questions)
          .values({
            subjectId: subject.id,
            topicId: topic.id,
            chunkId: chunk.id,
            prompt: q.prompt,
            options: { a: q.options[0], b: q.options[1], c: q.options[2], d: q.options[3] },
            correctOption: q.correct,
            explanation: q.explanation,
            sourceQuote: q.quote,
          })
          .returning();
        created.push({ id: row.id, correct: q.correct });
      }
      questionsByTopic.set(`${seed.name}/${t.name}`, created);

      for (const c of t.cards) {
        if (!chunk.text.includes(c.quote)) throw new Error(`La cita no está en el fragmento: «${c.quote}»`);
        if (c.box < 1 || c.box > MAX_BOX) throw new Error(`Caja inválida en «${c.front}»`);
        const dueAt = new Date(Date.now() + c.dueInDays * DAY_MS);
        const [card] = await db
          .insert(s.flashcards)
          .values({ subjectId: subject.id, topicId: topic.id, chunkId: chunk.id, front: c.front, back: c.back, sourceQuote: c.quote, box: c.box, dueAt })
          .returning();
        cardCount.total++;
        if (c.dueInDays <= 0) cardCount.due++;
        for (const r of c.history ?? []) {
          await db.insert(s.flashcardReviews).values({
            flashcardId: card.id,
            result: r.result,
            boxAfter: c.box,
            reviewedAt: daysAgo(r.daysAgo),
            nextDueAt: dueAt,
          });
        }
      }
    }
  }

  for (const a of ATTEMPTS) {
    const items: Array<{ id: string; correct: string; ok: boolean }> = [];
    for (const [topicName, oks] of Object.entries(a.results)) {
      const qs = questionsByTopic.get(`${a.subject}/${topicName}`);
      if (!qs) throw new Error(`Tema desconocido en un intento: ${a.subject}/${topicName}`);
      qs.slice(0, oks.length).forEach((q, i) => items.push({ ...q, ok: oks[i] }));
    }
    const inProgress = (a.unanswered ?? 0) > 0;
    const answeredItems = inProgress ? items.slice(0, items.length - a.unanswered!) : items;
    const when = daysAgo(a.daysAgo);
    const [attempt] = await db
      .insert(s.quizAttempts)
      .values({
        userId: user.id,
        subjectId: subjectIds.get(a.subject)!,
        total: items.length,
        status: inProgress ? "en_curso" : "terminado",
        score: inProgress ? null : items.filter((i) => i.ok).length,
        createdAt: when,
        finishedAt: inProgress ? null : when,
      })
      .returning();
    for (const [i, item] of items.entries()) {
      const answered = i < answeredItems.length;
      const wrong = ["a", "b", "c", "d"].find((l) => l !== item.correct)!;
      await db.insert(s.attemptAnswers).values({
        attemptId: attempt.id,
        questionId: item.id,
        position: i + 1,
        givenAnswer: answered ? (item.ok ? item.correct : wrong) : null,
        isCorrect: answered ? item.ok : null,
        seconds: answered ? 8 + ((i * 7) % 20) : null,
        answeredAt: answered ? when : null,
      });
    }
  }

  console.log(`Cuenta demo lista: ${email}`);
  console.log(`  ${SUBJECTS.length} materias, ${cardCount.total} tarjetas (${cardCount.due} pendientes), ${ATTEMPTS.length} intentos`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
