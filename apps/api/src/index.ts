import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth.js";
import { materialsRouter } from "./routes/materials.js";
import { quizzesRouter } from "./routes/quizzes.js";
import { subjectsRouter } from "./routes/subjects.js";
import { startGenerationWorker } from "./worker/generationWorker.js";
import { startMaterialWorker } from "./worker/materialWorker.js";

const app = express();
const port = process.env.PORT ?? 4000;

app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000", credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/subjects", subjectsRouter);
app.use("/subjects/:subjectId/materials", materialsRouter);
app.use("/subjects/:subjectId/quizzes", quizzesRouter);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
  startMaterialWorker();
  startGenerationWorker();
});
