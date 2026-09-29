export interface MaterialBlock {
  page: number;
  text: string;
}

export interface GeneratedQuestion {
  topic: string;
  question: string;
  options: { a: string; b: string; c: string; d: string };
  correctOption: "a" | "b" | "c" | "d";
  explanation: string;
  source: { page: number; quote: string };
}
