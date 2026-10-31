import test from "node:test";
import assert from "node:assert/strict";
import {
  catalog,
  movementDescriptions,
  loadSigns,
} from "../src/modules/signs/sign.repository.ts";

test("el repositorio publica Muy bien y conserva las otras candidatas deshabilitadas", () => {
  assert.equal(catalog.length, 11);
  assert.ok(catalog.some((sign) => sign.id === "muybien"));
  assert.ok(catalog.some((sign) => sign.id === "bienvenido"));
  assert.ok(!catalog.some((sign) => sign.id === "si"));
  for (const sign of catalog) assert.ok(movementDescriptions[sign.id]?.trim());
  const todas = loadSigns();
  assert.equal(todas.length, 33);
  const candidatas = [
    "apoyar",
    "ayuda",
    "bano",
    "buenasnoches",
    "buenastardes",
    "buenosdias",
    "comoesta",
    "congusto",
    "denada",
    "excelente",
    "invitar",
    "masomenos",
    "muchasgracias",
    "muymal",
    "necesitar",
    "permiso",
    "porfavor",
    "presentar",
    "sentarse",
    "tranquilo",
  ];
  for (const id of candidatas) {
    const sign = todas.find((s) => s.id === id);
    assert.ok(sign, `falta candidata ${id}`);
    assert.equal(sign.activa, false);
    assert.ok(sign.descripcion?.trim());
    assert.ok(movementDescriptions[id]?.trim());
    assert.ok(!catalog.some((s) => s.id === id));
  }
});

test("rechaza señas duplicadas o incompletas al iniciar", () => {
  assert.throws(() => loadSigns([{ id: "hola" }]), /seña/i);
  const sign = loadSigns()[0];
  assert.throws(() => loadSigns([sign, sign]), /duplicada/i);
});
