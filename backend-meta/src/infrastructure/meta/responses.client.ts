import type {
  RecognitionInput,
  RecognitionEvent,
} from "../../modules/recognition/recognition.types.ts";
import { parseRecognition } from "../../modules/recognition/recognition.result.ts";
import type { MetaEvent } from "./meta.types.ts";

// Only public summaries are forwarded. Raw reasoning and encrypted state are ignored.
async function* events(
  body: ReadableStream<Uint8Array> | null,
): AsyncGenerator<MetaEvent> {
  if (!body) throw new Error("Missing stream");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let data: string[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);
        if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
        else if (!line && data.length) {
          const payload = data.join("\n");
          data = [];
          if (payload !== "[DONE]") yield JSON.parse(payload) as MetaEvent;
        }
      }
      if (buffer.length > 1024 * 1024) throw new Error("Oversized event");
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function recognizeStream({
  onEvent,
  frames,
  model,
  apiKey,
  fetchImpl,
  signal,
  start,
  spec,
  videoDataUrl,
  videoFps,
}: RecognitionInput & { onEvent: (event: RecognitionEvent) => void }) {
  const elapsedMs = () => Math.round(performance.now() - start);
  const emit = onEvent;
  emit({
    type: "stage",
    stage: "contexto",
    message: `Contexto preparado: ${spec.description}; ${videoDataUrl ? "video completo" : `${frames.length} fotogramas en orden`}.`,
  });
  emit({
    type: "stage",
    stage: "enviando",
    message: `Enviando captura a ${model}.`,
  });
  try {
    const response = await fetchImpl("https://api.meta.ai/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      signal,
      body: JSON.stringify({
        model,
        stream: true,
        store: false,
        max_output_tokens: 4000,
        reasoning: { summary: "auto" },
        instructions: spec.prompt,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  spec.task ??
                  "Clasifica esta secuencia cronológica de una seña LSC.",
              },
              ...(videoDataUrl
                ? [
                    {
                      type: "input_video",
                      video_url: videoDataUrl,
                      ...(videoFps ? { fps: videoFps } : {}),
                    },
                  ]
                : frames.map((image_url) => ({
                    type: "input_image",
                    image_url,
                  }))),
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "reconocimiento_lsc",
            strict: true,
            schema: spec.schema,
          },
        },
      }),
    });
    if (!response.ok) throw new Error(`Meta HTTP ${response.status}`);
    emit({
      type: "stage",
      stage: "procesando",
      message: "Meta aceptó la petición. Esperando resúmenes y respuesta.",
    });
    let completed = false;
    const summaryParts = new Map<string, string>();
    const summaryText = () => [...summaryParts.values()].join("\n\n");
    let receivedOutput = false;
    for await (const event of events(response.body)) {
      if (
        event.type === "response.reasoning_summary_text.delta" &&
        typeof event.delta === "string"
      ) {
        const key = `${event.output_index ?? 0}:${event.summary_index ?? 0}`;
        summaryParts.set(key, (summaryParts.get(key) ?? "") + event.delta);
        if (summaryText().length > 64000) throw new Error("Summary too large");
        emit({ type: "summary", text: summaryText() });
      } else if (
        event.type === "response.reasoning_summary_text.done" &&
        typeof event.text === "string"
      ) {
        if (event.text.length > 64000) throw new Error("Summary too large");
        summaryParts.set(
          `${event.output_index ?? 0}:${event.summary_index ?? 0}`,
          event.text,
        );
        if (summaryText().length > 64000) throw new Error("Summary too large");
        emit({ type: "summary", text: summaryText() });
      } else if (
        event.type === "response.output_text.delta" &&
        !receivedOutput
      ) {
        receivedOutput = true;
        emit({
          type: "stage",
          stage: "respuesta",
          message: "Meta está generando la clasificación.",
        });
      } else if (
        ["response.failed", "response.incomplete", "error"].includes(event.type)
      ) {
        throw new Error("Provider failed");
      } else if (event.type === "response.completed") {
        if (event.response?.status !== "completed")
          throw new Error("Incomplete");
        emit({
          type: "stage",
          stage: "validando",
          message: "Validando clase, confianza y formato de la respuesta.",
        });
        const output = (event.response.output ?? [])
          .filter((item) => item.type === "message")
          .flatMap((item) => item.content ?? []);
        if (output.some((part) => part.type === "refusal"))
          throw new Error("Refused");
        const result = parseRecognition(
          JSON.parse(
            output
              .filter((part) => part.type === "output_text")
              .map((part) => part.text)
              .join(""),
          ) as unknown,
          spec,
        );
        emit({
          type: "result",
          result: {
            clase: result.clase,
            confianza: result.confianza,
            motivo: result.motivo,
            model,
            latencyMs: elapsedMs(),
            promptVersion: spec.promptVersion,
            resumen: summaryText(),
            usage: event.response.usage ?? null,
          },
        });
        completed = true;
        break;
      }
    }
    if (!completed) throw new Error("Truncated stream");
  } catch {
    if (!signal.aborted)
      emit({
        type: "error",
        message:
          "Meta no completó una respuesta válida. Reintenta la captura; revisa acceso y modelo si persiste.",
      });
  }
}
