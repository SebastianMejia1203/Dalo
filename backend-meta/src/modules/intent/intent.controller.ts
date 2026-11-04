import type { RequestHandler } from "express";
import { HttpError } from "../../shared/http/errors.ts";
import { requestLifecycle } from "../../shared/http/request-lifecycle.ts";
import { resolveIntent } from "./intent.service.ts";
import type { IntentDependencies } from "./intent.types.ts";

export function createIntentController(
  dependencies: IntentDependencies,
): RequestHandler {
  let busy = false;
  return async (req, res) => {
    if (busy)
      throw new HttpError(
        429,
        "BUSY",
        "Hay una interpretación en curso. Espera a que termine.",
      );
    busy = true;
    const lifecycle = requestLifecycle(res);
    try {
      const body = req.body as { text?: unknown } | null;
      const result = await resolveIntent(
        body?.text,
        dependencies,
        lifecycle.signal,
        performance.now(),
      );
      if (!res.destroyed) res.json(result);
    } finally {
      lifecycle.dispose();
      busy = false;
    }
  };
}
