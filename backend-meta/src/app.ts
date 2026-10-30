import type { RecognitionDependencies } from "./modules/recognition/recognition.types.ts";
import express from "express";
import { loadConfig, type AppConfig } from "./config/environment.ts";
import { extname, join } from "node:path";
import { motionSpec } from "./modules/signs/sign.context.ts";
import { normalizeVideo } from "./infrastructure/media/video.converter.ts";
import { originPolicy } from "./shared/http/security.ts";
import { errorHandler, HttpError } from "./shared/http/errors.ts";
import { catalogRoutes } from "./modules/signs/sign.routes.ts";
import { recognitionRoutes } from "./modules/recognition/recognition.routes.ts";
import { transcriptionRoutes } from "./modules/transcription/transcription.routes.ts";

export function createApp(options: Partial<RecognitionDependencies> = {}, config: AppConfig = loadConfig()) {
  const dependencies = {
    ...config,
    fetchImpl: fetch,
    convertVideo: normalizeVideo,
    recognitionSpec: motionSpec,
    ...options,
  };
  const app = express();
  app.set("env", config.nodeEnv);
  app.disable("x-powered-by");
  app.enable("strict routing");
  app.enable("case sensitive routing");
  app.use("/api", originPolicy(config.allowedOrigins));
  app.use("/api", catalogRoutes(dependencies));
  app.use("/api", transcriptionRoutes(dependencies));
  app.use("/api", recognitionRoutes(dependencies));
  // Las rutas API desconocidas nunca deben recibir index.html.
  app.use("/api", (_req, _res) => {
    throw new HttpError(404, "NOT_FOUND", "Ruta no encontrada.");
  });
  if (config.serveFrontend) {
    app.use(express.static(config.frontendDist, {
      dotfiles: "ignore",
      setHeaders: (res) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cache-Control", "no-cache");
      },
    }));
    app.get("/{*path}", (req, res, next) => {
      if (extname(req.path) || req.path.split("/").some((part) => part.startsWith(".")) || !req.accepts("html")) return next();
      res.set({ "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" });
      res.sendFile(join(config.frontendDist, "index.html"));
    });
  }
  app.use((_req, _res) => {
    throw new HttpError(404, "NOT_FOUND", "Ruta no encontrada.");
  });
  app.use(errorHandler);
  return app;
}
