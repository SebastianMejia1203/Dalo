import { Router, json } from "express";
import type { RecognitionDependencies } from "./recognition.types.ts";
import { createRecognitionController } from "./recognition.controller.ts";
import { requireJson } from "./recognition.validation.ts";
export function recognitionRoutes(dependencies: RecognitionDependencies) {
  const router = Router({ caseSensitive: true, strict: true });
  router.post(
    ["/recognize", "/recognize/stream"],
    requireJson,
    json({ limit: "6mb", strict: false, inflate: false }),
    createRecognitionController(dependencies),
  );
  return router;
}
