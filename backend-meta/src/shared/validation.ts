export type JsonObject = Record<string, unknown>;
export function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid object");
  return value as JsonObject;
}
