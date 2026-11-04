import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withApp } from "./helpers/http.ts";
import { loadConfig } from "../src/config/environment.ts";

function configConDb(adminToken = "") {
  const dir = mkdtempSync(join(tmpdir(), "dalo-admin-"));
  return loadConfig({
    ...process.env,
    ADMIN_TOKEN: adminToken,
    ADMIN_DB_PATH: join(dir, "admin.db"),
  });
}

const ensayo = (parcial = {}) => ({
  esperada: "hola",
  clase: "hola",
  confianza: 0.9,
  motivo: "x",
  model: "muse-spark-1.3-contributor",
  promptVersion: "lsc-motion-v4-11",
  latencyMs: 2000,
  fecha: "2026-11-03",
  ...parcial,
});

test("revisiones empiezan vacías y se guardan por seña", async () => {
  const config = configConDb();
  await withApp({ apiKey: "test" }, async (url) => {
    const vacias = await (await fetch(url + "/api/admin/revisions")).json();
    assert.deepEqual(vacias.revisions, []);
    const puesta = await fetch(url + "/api/admin/revisions/hola", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ veredicto: "se-entiende", notas: "Clara", validador: "Ana" }),
    });
    assert.equal(puesta.status, 201);
    const guardada = (await puesta.json()).revision;
    assert.equal(guardada.signId, "hola");
    assert.equal(guardada.validador, "Ana");
    assert.match(guardada.fecha, /^\d{4}-\d{2}-\d{2}$/);
    const lista = await (await fetch(url + "/api/admin/revisions")).json();
    assert.equal(lista.revisions.length, 1);
    assert.equal(lista.revisions[0].notas, "Clara");
  }, config);
});

test("revisiones rechazan seña desconocida y veredicto inválido", async () => {
  const config = configConDb();
  await withApp({ apiKey: "test" }, async (url) => {
    const desconocida = await fetch(url + "/api/admin/revisions/noexiste", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ veredicto: "se-entiende" }),
    });
    assert.equal(desconocida.status, 404);
    const invalido = await fetch(url + "/api/admin/revisions/hola", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ veredicto: "meh", notas: "x".repeat(3000) }),
    });
    assert.equal(invalido.status, 400);
  }, config);
});

test("importación reemplaza todas las revisiones de forma atómica", async () => {
  const config = configConDb();
  await withApp({ apiKey: "test" }, async (url) => {
    const put = (id: string) =>
      fetch(url + `/api/admin/revisions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ veredicto: "se-entiende", validador: "Ana" }),
      });
    await put("hola");
    await put("chao");
    const mala = await fetch(url + "/api/admin/revisions/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revisiones: { gracias: { veredicto: "meh" } } }),
    });
    assert.equal(mala.status, 400);
    const intactas = await (await fetch(url + "/api/admin/revisions")).json();
    assert.equal(intactas.revisions.length, 2);
    const buena = await fetch(url + "/api/admin/revisions/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        revisiones: { gracias: { veredicto: "corregir", validador: "Luis" } },
      }),
    });
    assert.equal((await buena.json()).count, 1);
    const finales = await (await fetch(url + "/api/admin/revisions")).json();
    assert.deepEqual(
      finales.revisions.map((r: { signId: string }) => r.signId),
      ["gracias"],
    );
  }, config);
});

test("sesiones de evaluación se crean, listan, analizan y borran", async () => {
  const config = configConDb();
  await withApp({ apiKey: "test" }, async (url) => {
    const creada = await fetch(url + "/api/admin/eval-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        codigo: "P1",
        notas: "Portátil, luz buena",
        ensayos: [ensayo(), ensayo({ clase: "chao", confianza: 0.6 }), ensayo({ esperada: "otra", clase: "otra" })],
      }),
    });
    assert.equal(creada.status, 201);
    const sesion = (await creada.json()).session;
    assert.equal(sesion.total, 3);
    assert.equal(sesion.correctos, 2);
    const lista = await (await fetch(url + "/api/admin/eval-sessions")).json();
    assert.equal(lista.sessions.length, 1);
    assert.equal(lista.sessions[0].codigo, "P1");
    const trials = await (await fetch(url + `/api/admin/eval-sessions/${sesion.id}/trials`)).json();
    assert.equal(trials.trials.length, 3);
    assert.equal(trials.trials[0].promptVersion, "lsc-motion-v4-11");
    const borrada = await fetch(url + `/api/admin/eval-sessions/${sesion.id}`, { method: "DELETE" });
    assert.equal((await borrada.json()).deleted, true);
    const ausente = await fetch(url + `/api/admin/eval-sessions/${sesion.id}/trials`);
    assert.equal(ausente.status, 404);
  }, config);
});

test("sesiones rechazan código y ensayos inválidos", async () => {
  const config = configConDb();
  await withApp({ apiKey: "test" }, async (url) => {
    const crear = (body: unknown) =>
      fetch(url + "/api/admin/eval-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    assert.equal((await crear({ codigo: "  ", ensayos: [ensayo()] })).status, 400);
    assert.equal((await crear({ codigo: "P1", ensayos: [] })).status, 400);
    assert.equal(
      (await crear({ codigo: "P1", ensayos: [ensayo({ confianza: 2 })] })).status,
      400,
    );
    assert.equal((await crear({ codigo: "P1" })).status, 400);
  }, config);
});

test("validación es pública aun con token; lo destructivo exige token", async () => {
  const config = configConDb("secreto");
  await withApp({ apiKey: "test" }, async (url) => {
    // Cualquier persona puede ver y guardar validaciones sin token.
    assert.equal((await fetch(url + "/api/admin/revisions")).status, 200);
    assert.equal((await fetch(url + "/api/admin/eval-sessions")).status, 200);
    assert.equal((await fetch(url + "/api/admin/signs")).status, 200);
    const guardar = await fetch(url + "/api/admin/revisions/hola", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        veredicto: "se-entiende",
        notas: "Clara",
        validador: "Visitante",
      }),
    });
    assert.equal(guardar.status, 201);
    // Sin nombre o sin veredicto no se guarda.
    const sinNombre = await fetch(url + "/api/admin/revisions/hola", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ veredicto: "se-entiende" }),
    });
    assert.equal(sinNombre.status, 400);
    // Lo destructivo/administrativo sí exige token.
    assert.equal(
      (
        await fetch(url + "/api/admin/revisions/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revisiones: {} }),
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(url + "/api/admin/signs/hola", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activa: true }),
        })
      ).status,
      401,
    );
    const headers = { "x-admin-token": "secreto" };
    assert.equal(
      (await fetch(url + "/api/admin/revisions", { headers })).status,
      200,
    );
  }, config);
});

test("varias personas pueden validar la misma seña sin sobrescribirse", async () => {
  const config = configConDb();
  await withApp({ apiKey: "test" }, async (url) => {
    const guardar = (validador: string, veredicto: string) =>
      fetch(url + "/api/admin/revisions/hola", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ veredicto, notas: "", validador }),
      });
    assert.equal((await guardar("Ana", "se-entiende")).status, 201);
    assert.equal((await guardar("Luis", "corregir")).status, 201);
    assert.equal((await guardar("Ana", "no-valida")).status, 201);
    const lista = await (await fetch(url + "/api/admin/revisions")).json();
    assert.equal(lista.revisions.length, 3);
    assert.deepEqual(
      lista.revisions.map((r: { validador: string }) => r.validador).sort(),
      ["Ana", "Ana", "Luis"],
    );
    assert.ok(lista.revisions.every((r: { id: number }) => r.id > 0));
  }, config);
});
