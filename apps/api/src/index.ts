import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth.js";
import { materialsRouter } from "./routes/materials.js";
import { subjectsRouter } from "./routes/subjects.js";

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

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
