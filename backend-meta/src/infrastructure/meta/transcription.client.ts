import type {
  TranscriptionDependencies,
  TranscriptionResult,
} from "../../modules/transcription/transcription.types.ts";
import { HttpError } from "../../shared/http/errors.ts";
import { object } from "../../shared/validation.ts";
export async function requestTranscription(
  audio: Buffer,
  keywords: string[],
  { apiKey, fetchImpl }: TranscriptionDependencies,
  signal: AbortSignal,
): Promise<TranscriptionResult> {
  const form = new FormData();
  form.set(
    "request",
    new Blob(
      [
        JSON.stringify({
          model: "muse-voice-transcribe-1.0",
          audioEncoding: "WAV",
          mode: "PUSH_TO_TALK",
          languageBias: ["Spanish"],
          keywords: keywords,
        }),
      ],
      { type: "application/json" },
    ),
  );
  form.set(
    "audio",
    new Blob([new Uint8Array(audio)], { type: "audio/wav" }),
    "dictado.wav",
  );
  const response = await fetchImpl("https://api.meta.ai/v1/asr/transcribe", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    body: form,
    signal: signal,
  });
  if (!response.ok)
    throw new HttpError(
      502,
      "META_ERROR",
      `Voice Transcribe respondió HTTP ${response.status}. Revisa acceso y saldo.`,
    );
  const body = object(await response.json());
  if (typeof body.transcript !== "string" || body.transcript.length > 20000)
    throw new Error("Invalid transcript");
  return {
    transcript: body.transcript,
    model: "muse-voice-transcribe-1.0",
    audioDurationMs:
      typeof body.audioDurationMs === "number" ? body.audioDurationMs : null,
  };
}
