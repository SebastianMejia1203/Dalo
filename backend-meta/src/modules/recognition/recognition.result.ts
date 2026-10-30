import type { RecognitionSpec } from "../signs/sign.types.ts";
import type { RecognitionResult } from "./recognition.types.ts";
import { object } from "../../shared/validation.ts";
export function parseRecognition(
  value: unknown,
  spec: RecognitionSpec,
): Pick<RecognitionResult, "clase" | "confianza" | "motivo"> {
  const result = object(value);
  if (
    typeof result.clase !== "string" ||
    result.clase.length < 1 ||
    result.clase.length > 120 ||
    (spec.classes !== null && !spec.classes.includes(result.clase)) ||
    typeof result.confianza !== "number" ||
    !Number.isFinite(result.confianza) ||
    result.confianza < 0 ||
    result.confianza > 1 ||
    typeof result.motivo !== "string" ||
    result.motivo.length > 2000
  )
    throw new Error("Invalid output");
  return {
    clase: result.clase,
    confianza: result.confianza,
    motivo: result.motivo,
  };
}
