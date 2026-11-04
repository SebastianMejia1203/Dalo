import { HttpError } from "../../shared/http/errors.ts";
import { requestIntent } from "../../infrastructure/meta/intent.client.ts";
import type { IntentDependencies } from "./intent.types.ts";

export const MAX_INTENT_TEXT = 300;

export async function resolveIntent(
  text: unknown,
  dependencies: IntentDependencies,
  signal: AbortSignal,
  start: number,
) {
  if (typeof text !== "string" || !text.trim() || text.length > MAX_INTENT_TEXT)
    throw new HttpError(
      400,
      "INVALID_TEXT",
      `Envía un texto de 1 a ${MAX_INTENT_TEXT} caracteres.`,
    );
  if (!dependencies.apiKey.trim())
    throw new HttpError(
      503,
      "API_KEY_MISSING",
      "Falta configurar META_API_KEY en el backend.",
    );
  try {
    return await requestIntent(text.trim(), dependencies, signal, start);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      502,
      "INTENT_FAILED",
      "No se pudo interpretar el mensaje con Meta. Se conserva la búsqueda local.",
    );
  }
}
