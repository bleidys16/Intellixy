import "dotenv/config";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractPdf } from "./extractPdf.js";
import { buildUserPrompt, SYSTEM_PROMPT } from "./buildPrompt.js";
import { generateQuiz } from "./generateQuiz.js";
import { citationExists } from "./validateCitations.js";
import type { QuizQuestion } from "./types.js";

type ReviewedQuestion = QuizQuestion & { citaVerificada: boolean };

const here = path.dirname(fileURLToPath(import.meta.url));
const samplesDir = path.join(here, "..", "samples");
const outputDir = path.join(here, "..", "output");
const QUESTION_COUNT = 10;

async function main() {
  const files = (await readdir(samplesDir)).filter((f) => f.toLowerCase().endsWith(".pdf"));
  if (files.length === 0) {
    throw new Error(`No hay PDF en ${samplesDir}`);
  }

  console.log(`Extrayendo texto de ${files.length} PDF...`);
  const materials = await Promise.all(files.map((f) => extractPdf(path.join(samplesDir, f))));
  for (const m of materials) {
    console.log(`  - ${m.file}: ${m.pages.length} paginas`);
  }

  console.log(`\nGenerando ${QUESTION_COUNT} preguntas con el modelo...`);
  const userPrompt = buildUserPrompt(materials, QUESTION_COUNT);
  const { questions } = await generateQuiz(SYSTEM_PROMPT, userPrompt);

  const results = questions.map((q) => ({
    ...q,
    citaVerificada: citationExists(materials, q),
  }));

  const verifiedCount = results.filter((r) => r.citaVerificada).length;
  console.log(
    `\nCitas verificadas automáticamente: ${verifiedCount}/${results.length} ` +
      `(esto solo confirma que la cita existe en el texto; la corrección de cada pregunta se revisa a mano)`,
  );

  await mkdir(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(outputDir, `quiz-${stamp}.json`);
  const reviewPath = path.join(outputDir, `quiz-${stamp}-revision.md`);

  await writeFile(jsonPath, JSON.stringify({ questions: results }, null, 2), "utf-8");
  await writeFile(reviewPath, buildReviewMarkdown(results), "utf-8");

  console.log(`\nGuardado:\n  ${jsonPath}\n  ${reviewPath}`);
  console.log(
    `\nAbrí el .md y marcá cuántas preguntas están bien (contenido correcto y cita real). ` +
      `Meta de la Fase 0: más de 8 de cada 10.`,
  );
}

function buildReviewMarkdown(results: ReviewedQuestion[]): string {
  const lines: string[] = ["# Revisión manual — Fase 0", ""];
  results.forEach((q, i) => {
    lines.push(`## ${i + 1}. [ ] ¿Correcta? — ${q.topic}`);
    lines.push("");
    lines.push(`**Pregunta:** ${q.question}`);
    lines.push("");
    for (const key of ["a", "b", "c", "d"] as const) {
      const mark = key === q.correctOption ? "✅" : "  ";
      lines.push(`- ${mark} ${key}) ${q.options[key]}`);
    }
    lines.push("");
    lines.push(`**Explicación del modelo:** ${q.explanation}`);
    lines.push("");
    lines.push(
      `**Fuente citada:** ${q.source.file}, página ${q.source.page} — ${
        q.citaVerificada ? "cita verificada ✅" : "cita NO encontrada en el texto ⚠️"
      }`,
    );
    lines.push(`> ${q.source.quote}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  });
  return lines.join("\n");
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.cause) {
    console.error("Cause:", err.cause);
  }
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
