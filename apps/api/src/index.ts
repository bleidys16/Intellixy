import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth.js";
import { flashcardsRouter } from "./routes/flashcards.js";
import { materialsRouter } from "./routes/materials.js";
import { progressRouter } from "./routes/progress.js";
import { quizzesRouter } from "./routes/quizzes.js";
import { tutorRouter } from "./routes/tutor.js";
import { subjectsRouter } from "./routes/subjects.js";
import { startGenerationWorker } from "./worker/generationWorker.js";
import { startMaterialWorker } from "./worker/materialWorker.js";
import { startTutorWorker } from "./worker/tutorWorker.js";

const app = express();
const port = process.env.PORT ?? 4000;

// Además de WEB_ORIGIN (o localhost:3000 por defecto), siempre se acepta la IP de red local
// en el puerto 3000 (rangos privados 192.168.x, 10.x, 172.16-31.x), para poder probar desde
// el celular en la misma WiFi sin tener que tocar variables de entorno.
const LAN_ORIGIN = /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):3000$/;
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      callback(null, origin === webOrigin || LAN_ORIGIN.test(origin));
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/subjects", subjectsRouter);
app.use("/subjects/:subjectId/materials", materialsRouter);
app.use("/subjects/:subjectId/quizzes", quizzesRouter);
app.use("/subjects/:subjectId/flashcards", flashcardsRouter);
app.use("/subjects/:subjectId/tutor", tutorRouter);
app.use("/subjects/:subjectId/progress", progressRouter);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
  startMaterialWorker();
  startGenerationWorker();
  startTutorWorker();
});
