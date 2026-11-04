import type { FetchClient } from "../recognition/recognition.types.ts";

export interface IntentDependencies {
  apiKey: string;
  model: string;
  fetchImpl: FetchClient;
}

export interface IntentResult {
  /** Id de una expresión del catálogo, o `null` si ninguna corresponde. */
  id: string | null;
  confianza: number;
  motivo: string;
  model: string;
  latencyMs: number;
  promptVersion: string;
}
