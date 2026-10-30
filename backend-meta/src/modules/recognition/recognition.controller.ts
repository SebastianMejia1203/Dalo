import type { RecognitionDependencies } from "./recognition.types.ts";
import type { RequestHandler } from "express";
import { requestLifecycle } from "../../shared/http/request-lifecycle.ts";
import { HttpError } from "../../shared/http/errors.ts";
import { validateFrames } from "./recognition.validation.ts";
import { recognizeFrames } from "../../infrastructure/meta/chat.client.ts";
import { streamRecognition } from "./recognition.stream.ts";
export function createRecognitionController({
  apiKey,
  model,
  fetchImpl,
  convertVideo,
  recognitionSpec,
}: RecognitionDependencies): RequestHandler {
  let busy = false;
  return async (req, res) => {
    const body = req.body as {
      frames?: unknown;
      videoDataUrl?: unknown;
    } | null;
    const streaming = req.path.endsWith("/stream");
    const rawVideo = body?.videoDataUrl;
    const hasVideo = streaming && typeof rawVideo === "string";
    if (hasVideo) {
      if (
        !/^data:video\/(mp4|webm);base64,[A-Za-z0-9+/]+={0,2}$/.test(rawVideo)
      )
        throw new HttpError(
          400,
          "INVALID_VIDEO",
          "Envía un video MP4 o WebM válido.",
        );
    } else validateFrames(body?.frames);
    if (!apiKey.trim())
      throw new HttpError(
        503,
        "API_KEY_MISSING",
        "Añade META_API_KEY en backend-meta/.env y reinicia el backend.",
      );
    if (busy)
      throw new HttpError(
        429,
        "BUSY",
        "Hay un análisis en curso. Espera a que termine.",
      );
    busy = true;
    const start = performance.now();
    const lifecycle = requestLifecycle(res);
    try {
      const signal = lifecycle.signal;
      const videoDataUrl = hasVideo
        ? await convertVideo(rawVideo, signal)
        : undefined;
      if (streaming)
        return await streamRecognition({
          res,
          frames: Array.isArray(body?.frames) ? (body.frames as string[]) : [],
          videoDataUrl,
          videoFps: hasVideo ? 12 : undefined,
          spec: recognitionSpec,
          model,
          apiKey,
          fetchImpl,
          start,
          signal,
        });
      const result = await recognizeFrames({
        frames: body?.frames as string[],
        spec: recognitionSpec,
        model,
        apiKey,
        fetchImpl,
        signal,
        start,
      });
      return res.status(200).json(result);
    } finally {
      lifecycle.dispose();
      busy = false;
    }
  };
}
