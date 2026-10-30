import test from "node:test";
import assert from "node:assert/strict";
import { object } from "../src/shared/validation.ts";
import { createMotionSpec } from "../src/modules/signs/sign.context.ts";
test("al ampliar el catálogo las clases permitidas y descripciones siguen el mismo conjunto", () => {
  const spec = createMotionSpec(
    [
      { id: "hola", nombre: "Hola", significado: "Hola", intencion: "Saludar" },
      { id: "bien", nombre: "Bien", significado: "Bien", intencion: "Aprobar" },
    ],
    { hola: "saludo", bien: "pulgar arriba", mal: "pulgar abajo" },
    "test-context",
  );
  assert.deepEqual(spec.classes, ["hola", "bien", "otra"]);
  assert.deepEqual(object(object(spec.schema.properties).clase).enum, [
    "hola",
    "bien",
    "otra",
  ]);
  assert.equal(spec.prompt.includes("pulgar arriba"), true);
  assert.equal(spec.prompt.includes("pulgar abajo"), false);
});
