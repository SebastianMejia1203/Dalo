import { Router, json } from "express";
import { requireJson } from "../recognition/recognition.validation.ts";
import { createIntentController } from "./intent.controller.ts";
import type { IntentDependencies } from "./intent.types.ts";

export function intentRoutes(dependencies: IntentDependencies) {
  const router = Router({ caseSensitive: true, strict: true });
  router.post(
    "/intent",
    requireJson,
    json({ limit: "16kb", strict: false, inflate: false }),
    createIntentController(dependencies),
  );
  return router;
}
