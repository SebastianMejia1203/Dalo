import type { SignDefinition } from "./sign.types.ts";
import { object } from "../../shared/validation.ts";
import { readFileSync, readdirSync } from "node:fs";

const root = new URL("../../../senas/", import.meta.url);
export const categories = ["cordialidad", "numeros", "colores"];

export function loadSigns(records?: unknown[]): SignDefinition[] {
  const signs =
    records ??
    categories.flatMap((category) => {
      const directory = new URL(`${category}/`, root);
      return readdirSync(directory)
        .filter((file) => file.endsWith(".json"))
        .sort()
        .map((file) => {
          const sign = object(JSON.parse(
            readFileSync(new URL(file, directory), "utf8"),
          ) as unknown);
          if (file !== `${sign.id}.json`)
            throw new Error(`Archivo de seña incompatible: ${file}`);
          return { ...sign, categoria: category };
        });
    });
  const seen = new Set();
  for (const value of signs) {
    const sign = object(value);
    if (
      typeof sign.id !== "string" ||
      !/^[a-z][a-z0-9]*$/.test(sign.id) ||
      sign.id === "otra" ||
      seen.has(sign.id) ||
      !["nombre", "significado", "intencion", "descripcion"].every(
        (key) => typeof sign[key] === "string" && sign[key].trim(),
      ) ||
      typeof sign.activa !== "boolean" ||
      !Number.isInteger(sign.orden) ||
      !Number.isInteger(sign.ordenDescripcion)
    ) {
      throw new Error(
        `Definición de seña inválida o duplicada: ${sign.id ?? "sin id"}`,
      );
    }
    seen.add(sign.id);
  }
  return signs as SignDefinition[];
}

const signs = loadSigns();
export const catalog = signs
  .filter((sign) => sign.activa)
  .sort((a, b) => a.orden - b.orden)
  .map(({ id, nombre, significado, intencion }) => ({
    id,
    nombre,
    significado,
    intencion,
  }));
export const movementDescriptions = Object.fromEntries(
  signs
    .sort((a, b) => a.ordenDescripcion - b.ordenDescripcion)
    .map((sign) => [sign.id, sign.descripcion]),
);
