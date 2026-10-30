import test from "node:test";
import assert from "node:assert/strict";
import {
  catalog,
  movementDescriptions,
  loadSigns,
} from "../src/modules/signs/sign.repository.ts";

test("el repositorio carga diez señas activas y conserva candidatas deshabilitadas", () => {
  assert.equal(catalog.length, 10);
  assert.ok(catalog.some((sign) => sign.id === "bienvenido"));
  assert.ok(!catalog.some((sign) => sign.id === "si"));
  for (const sign of catalog) assert.ok(movementDescriptions[sign.id]?.trim());
  assert.equal(loadSigns().length, 12);
});

test("rechaza señas duplicadas o incompletas al iniciar", () => {
  assert.throws(() => loadSigns([{ id: "hola" }]), /seña/i);
  const sign = loadSigns()[0];
  assert.throws(() => loadSigns([sign, sign]), /duplicada/i);
});
