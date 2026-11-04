import { signDefinitions } from "../signs/sign.repository.ts";

export const INTENT_PROMPT_VERSION = "lsc-intent-v1";

/** Expresiones entre las que puede elegir la intención (todas las definidas). */
export const intentEntries = signDefinitions.map(
  ({ id, nombre, significado, intencion }) => ({
    id,
    nombre,
    significado,
    intencion,
  }),
);

const allowedIds = [...intentEntries.map((entry) => entry.id), "fuera"];

export const intentSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    clase: { type: "string", enum: allowedIds },
    confianza: { type: "number", minimum: 0, maximum: 1 },
    motivo: { type: "string" },
  },
  required: ["clase", "confianza", "motivo"],
};

export const intentPrompt = `Eres un enrutador de intenciones para Daló, una ayuda de comunicación entre español y Lengua de Señas Colombiana (LSC). Recibes UN mensaje en español y debes relacionarlo con UNA expresión del catálogo cerrado, o devolver "fuera" si ninguna corresponde. No traduces a LSC ni inventas expresiones: solo eliges el id cuya intención comunicativa coincide con lo que la persona quiere decir. Interpreta lenguaje natural, cortesías, preguntas y reformulaciones ("¿me podrías repetir, por favor?" puede ser "esperar" solo si pide esperar; "todo salió muy bien" es "muybien"). Si el mensaje pide algo sin expresión equivalente, es ambiguo entre varias sin una dominante, o no es un mensaje para comunicar a otra persona, devuelve "fuera". La confianza es subjetiva, no calibrada. En motivo explica en una frase la correspondencia elegida. Catálogo: ${JSON.stringify(intentEntries)}`;
