export interface PageText {
  page: number;
  text: string;
}

export interface ExtractedMaterial {
  file: string;
  pages: PageText[];
}

export interface QuizQuestion {
  topic: string;
  question: string;
  options: { a: string; b: string; c: string; d: string };
  correctOption: "a" | "b" | "c" | "d";
  explanation: string;
  source: { file: string; page: number; quote: string };
}

export interface QuizResponse {
  questions: QuizQuestion[];
}
