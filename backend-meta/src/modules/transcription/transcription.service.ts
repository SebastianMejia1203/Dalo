import { catalog } from "../signs/sign.repository.ts";
import { HttpError } from "../../shared/http/errors.ts";
import { requestTranscription } from "../../infrastructure/meta/transcription.client.ts";
import type { TranscriptionDependencies } from "./transcription.types.ts";
export async function transcribeAudio(
  audio: Buffer,
  dependencies: TranscriptionDependencies,
  signal: AbortSignal,
) {
  const { apiKey } = dependencies;
  if (
    audio.length < 46 ||
    audio.toString("ascii", 0, 4) !== "RIFF" ||
    audio.toString("ascii", 8, 12) !== "WAVE" ||
    audio.toString("ascii", 12, 16) !== "fmt " ||
    audio.readUInt16LE(20) !== 1 ||
    audio.readUInt16LE(22) !== 1 ||
    ![16000, 24000].includes(audio.readUInt32LE(24)) ||
    audio.readUInt16LE(34) !== 16 ||
    audio.toString("ascii", 36, 40) !== "data" ||
    audio.readUInt32LE(40) !== audio.length - 44
  )
    throw new HttpError(
      400,
      "INVALID_AUDIO",
      "Audio inválido: usa WAV mono PCM de 16 bits, a 16 o 24 kHz.",
    );
  if (!apiKey.trim())
    throw new HttpError(
      503,
      "API_KEY_MISSING",
      "Falta configurar META_API_KEY en el backend.",
    );

  try {
    return await requestTranscription(
      audio,
      catalog.map((sign) => sign.nombre),
      dependencies,
      signal,
    );
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      502,
      "TRANSCRIPTION_FAILED",
      "No se pudo completar la transcripción de Meta. Reintenta el dictado.",
    );
  }
}
