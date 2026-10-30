import type { RecognitionInput } from "../../modules/recognition/recognition.types.ts";
import { parseRecognition } from "../../modules/recognition/recognition.result.ts";
import { object } from "../../shared/validation.ts";
import { HttpError } from "../../shared/http/errors.ts";
export async function recognizeFrames({
  frames,
  spec: recognitionSpec,
  model,
  apiKey,
  fetchImpl,
  signal,
  start,
}: RecognitionInput) {
  const response = await fetchImpl("https://api.meta.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      messages: [
        { role: "system", content: recognitionSpec.prompt },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Clasifica esta secuencia cronológica de una seña LSC.",
            },
            ...frames.map((url) => ({
              type: "image_url",
              image_url: { url },
            })),
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "reconocimiento_lsc",
          strict: true,
          schema: recognitionSpec.schema,
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
  const result = parseRecognition(
    JSON.parse(message.content) as unknown,
    recognitionSpec,
  );
  return {
    clase: result.clase,
    confianza: result.confianza,
    motivo: result.motivo,
    model,
    latencyMs: Math.round(performance.now() - start),
    promptVersion: recognitionSpec.promptVersion,
  };
}
