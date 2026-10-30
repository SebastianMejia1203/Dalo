import type {
  RecognitionInput,
  RecognitionEvent,
} from "./recognition.types.ts";
import type { RecognitionSpec } from "../signs/sign.types.ts";
import {
  catalog,
  classes,
  schema,
  prompt,
  promptVersion,
} from "../signs/sign.schema.ts";
import { recognizeStream } from "../../infrastructure/meta/responses.client.ts";
export interface StreamResponse {
  destroyed?: boolean;
  writeHead(status: number, headers: Record<string, string>): unknown;
  flushHeaders(): unknown;
  write(chunk: string): unknown;
  end(): unknown;
}
export async function streamRecognition({
  res,
  spec = {
    classes,
    schema,
    prompt,
    promptVersion,
    description: `LSC, ${catalog.length} clases y rechazo con otra`,
  },
  ...input
}: Omit<RecognitionInput, "spec"> & {
  res: StreamResponse;
  spec?: RecognitionSpec;
}) {
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    "X-Accel-Buffering": "no",
    "X-Content-Type-Options": "nosniff",
  });
  res.flushHeaders();
  const emit = (event: RecognitionEvent) => {
    if (!res.destroyed)
      res.write(
        JSON.stringify({
          ...event,
          elapsedMs: Math.round(performance.now() - input.start),
        }) + "\n",
      );
  };
  const heartbeat = setInterval(() => emit({ type: "heartbeat" }), 1000);
  try {
    await recognizeStream({ ...input, spec, onEvent: emit });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
}
