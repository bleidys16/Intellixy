import type { Question } from "@/lib/types";
import { QuestionCard } from "./QuestionCard";

const TYPE_LABEL: Record<Question["material"]["type"], string> = {
  pdf: "PDF",
  image: "Imagen",
  text: "Texto",
};

/** Agrupa preservando el orden: el material con preguntas más recientes queda primero. */
function groupByMaterial(questions: Question[]) {
  const groups = new Map<string, { material: Question["material"]; questions: Question[] }>();
  for (const q of questions) {
    const group = groups.get(q.material.id);
    if (group) group.questions.push(q);
    else groups.set(q.material.id, { material: q.material, questions: [q] });
  }
  return [...groups.values()];
}

export function QuestionGroups({ questions }: { questions: Question[] }) {
  return (
    <div className="mt-4 flex flex-col gap-6">
      {groupByMaterial(questions).map(({ material, questions: items }) => (
        <details key={material.id} open className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl bg-card-blue/50 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium">
              {TYPE_LABEL[material.type]}
            </span>
            <span className="min-w-0 flex-1 truncate font-display font-semibold">
              {material.name}
            </span>
            <span className="shrink-0 text-sm text-ciruela/60">
              {items.length} {items.length === 1 ? "pregunta" : "preguntas"}
            </span>
            <span aria-hidden className="shrink-0 text-ciruela/50 transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <ul className="mt-3 flex flex-col gap-4">
            {items.map((q) => (
              <QuestionCard key={q.id} question={q} />
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
