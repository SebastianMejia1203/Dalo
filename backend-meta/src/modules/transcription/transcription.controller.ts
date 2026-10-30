import type { RequestHandler } from "express";
import type { TranscriptionDependencies } from "./transcription.types.ts";
import { transcribeAudio } from "./transcription.service.ts";
import { HttpError } from "../../shared/http/errors.ts";
import { requestLifecycle } from "../../shared/http/request-lifecycle.ts";
export function createTranscriptionController(
  dependencies: TranscriptionDependencies,
): RequestHandler {
  let busy = false;
  return async (req, res) => {
    if (busy)
      throw new HttpError(
        429,
        "BUSY",
        "Hay un dictado en curso. Espera a que termine.",
      );
    busy = true;
    const lifecycle = requestLifecycle(res);
    try {
      if (!req.is("audio/wav"))
        throw new HttpError(415, "CONTENT_TYPE", "Se requiere WAV mono PCM.");
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk as Uint8Array);
        size += buffer.length;
        if (size > 1_000_000)
          throw new HttpError(
            413,
            "TOO_LARGE",
            "Dictado demasiado largo. Graba un máximo de 15 segundos.",
          );
        chunks.push(buffer);
      }
      const result = await transcribeAudio(
        Buffer.concat(chunks),
        dependencies,
        lifecycle.signal,
      );
      if (!res.destroyed) res.json(result);
    } finally {
      lifecycle.dispose();
      busy = false;
    }
  };
}
