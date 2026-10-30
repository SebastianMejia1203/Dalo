import { Router } from "express";
import type { TranscriptionDependencies } from "./transcription.types.ts";
import { createTranscriptionController } from "./transcription.controller.ts";
export function transcriptionRoutes(dependencies: TranscriptionDependencies) {
  const router = Router({ caseSensitive: true, strict: true });
  router.post("/transcribe", createTranscriptionController(dependencies));
  return router;
}
