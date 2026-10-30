import type { FetchClient } from "../recognition/recognition.types.ts";
export interface TranscriptionDependencies {
  apiKey: string;
  fetchImpl: FetchClient;
}
export interface TranscriptionResult {
  transcript: string;
  model: string;
  audioDurationMs: number | null;
}
