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
}
