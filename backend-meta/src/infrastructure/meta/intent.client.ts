import { object } from "../../shared/validation.ts";
import { HttpError } from "../../shared/http/errors.ts";
import {
  INTENT_PROMPT_VERSION,
  intentPrompt,
  intentSchema,
  intentEntries,
} from "../../modules/intent/intent.context.ts";
import type {
  IntentDependencies,
  IntentResult,
} from "../../modules/intent/intent.types.ts";

/** Elige la expresión del catálogo cuya intención coincide con el texto. */
export async function requestIntent(
  text: string,
  dependencies: IntentDependencies,
  signal: AbortSignal,
  start: number,
): Promise<IntentResult> {
  const { apiKey, model, fetchImpl } = dependencies;
  const response = await fetchImpl("https://api.meta.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      model,
      // El modelo consume tokens en razonamiento antes de responder:
      // con 500 la respuesta llega vacía (finish_reason "length").
      max_tokens: 2000,
      messages: [
        { role: "system", content: intentPrompt },
        { role: "user", content: text },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "intencion_lsc",
          strict: true,
          schema: intentSchema,
        },
      },
    }),
  });
  if (!response.ok)
    throw new HttpError(
      502,
      "META_ERROR",
      `Meta respondió HTTP ${response.status}. Revisa acceso, saldo y modelo en el backend.`,
    );
  const data = object(await response.json());
  const choice = object(
    Array.isArray(data.choices) ? data.choices[0] : undefined,
  );
  const message = object(choice.message);
  if (
    choice.finish_reason !== "stop" ||
    message.refusal ||
    typeof message.content !== "string"
  )
    throw new Error("Incomplete");
  const parsed = object(JSON.parse(message.content) as unknown);
  const clase = parsed.clase;
  const confianza = parsed.confianza;
  const motivo = parsed.motivo;
  if (
    typeof clase !== "string" ||
    (clase !== "fuera" &&
      !intentEntries.some((entry) => entry.id === clase)) ||
    typeof confianza !== "number" ||
    !Number.isFinite(confianza) ||
    confianza < 0 ||
    confianza > 1 ||
    typeof motivo !== "string" ||
    motivo.length > 2000
  )
    throw new Error("Invalid output");
  return {
    id: clase === "fuera" ? null : clase,
    confianza,
    motivo,
    model,
    latencyMs: Math.round(performance.now() - start),
    promptVersion: INTENT_PROMPT_VERSION,
  };
}
