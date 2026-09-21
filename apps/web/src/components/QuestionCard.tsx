import type { Question } from "@/lib/types";

const OPTION_LETTERS = ["a", "b", "c", "d"] as const;

export function QuestionCard({ question: q }: { question: Question }) {
  return (
    <li className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
      {q.topic && (
        <span className="rounded-full bg-card-lime px-2.5 py-0.5 text-xs font-medium text-ciruela">
          {q.topic.name}
        </span>
      )}
      <p className="mt-2 font-medium">{q.prompt}</p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {OPTION_LETTERS.map((letter) => (
          <li
            key={letter}
            className={`rounded-lg px-3 py-2 text-sm ${
              letter === q.correctOption
                ? "bg-teal-deep/10 font-medium text-teal-deep"
                : "text-ciruela/70"
            }`}
          >
            {letter}) {q.options[letter]}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-ciruela/60">{q.explanation}</p>
      <p className="mt-2 border-l-2 border-turquesa pl-2 text-xs italic text-ciruela/50">
        “{q.sourceQuote}”
      </p>
    </li>
  );
}
