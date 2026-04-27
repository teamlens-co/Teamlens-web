import express, { type Request, type Response } from "express";
import cors from "cors";
import { env } from "./config/env";
import mainRoutes from "./mainRoutes";

const app = express();

// Trust reverse proxy headers (x-forwarded-*) in production deployments.
app.set("trust proxy", 1);

const frontendOrigin = process.env.FRONTEND_ORIGIN?.trim();
const frontendOrigins = process.env.FRONTEND_ORIGINS?.split(",")
  .map((value) => value.trim())
  .filter(Boolean) ?? [];

const allowedOrigins = new Set([
  env.webAppUrl,
  frontendOrigin,
  ...frontendOrigins,
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:1420",
  "http://127.0.0.1:1420",
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "http://91.108.105.211:3001",
]);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin) || /^file:\/\//.test(origin) || /^tauri:\/\//.test(origin) || /^https?:\/\/tauri\.localhost/.test(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin not allowed: ${origin}`));
    },
    credentials: true,
  }),
);

// JSON parser for most endpoints
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "TeamLens backend is running",
  });
});

app.use("/api", mainRoutes);

export default app;
