import type { RecognitionDependencies } from "../recognition/recognition.types.ts";
import { Router } from "express";
import { catalog } from "./sign.repository.ts";
export function catalogRoutes({
  apiKey,
  model,
  recognitionSpec,
}: RecognitionDependencies) {
  const router = Router({ caseSensitive: true, strict: true });
  router.get("/health", (_req, res) =>
    res.json({
      configured: !!apiKey.trim(),
      model,
      voiceModel: "muse-voice-transcribe-1.0",
    }),
  );
  router.get("/catalog", (_req, res) => res.json(catalog));
  router.get("/context", (_req, res) =>
    res.json({
      model,
      instructions: recognitionSpec.prompt,
      catalog,
      promptVersion: recognitionSpec.promptVersion,
    }),
  );
  return router;
}
