import type { RecognitionSpec } from "../signs/sign.types.ts";
export type FetchClient = (
  url: string,
  options: RequestInit,
) => Promise<Response>;
export interface ProviderConfig {
  apiKey: string;
  model: string;
  fetchImpl: FetchClient;
}
export interface RecognitionDependencies extends ProviderConfig {
  convertVideo: (dataUrl: string, signal: AbortSignal) => Promise<string>;
  recognitionSpec: RecognitionSpec;
}
export interface RecognitionResult {
  clase: string;
  confianza: number;
  motivo: string;
  model: string;
  latencyMs: number;
  promptVersion: string;
  resumen?: string;
  usage?: unknown;
}
export type RecognitionEvent =
  | { type: "stage"; stage: string; message: string }
  | { type: "heartbeat" }
  | { type: "summary"; text: string }
  | { type: "error"; message: string }
  | { type: "result"; result: RecognitionResult };
export interface RecognitionInput extends ProviderConfig {
  frames: string[];
  signal: AbortSignal;
  start: number;
  spec: RecognitionSpec;
  videoDataUrl?: string;
  videoFps?: number;
}
