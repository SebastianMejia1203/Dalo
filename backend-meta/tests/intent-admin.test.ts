import test from "node:test";
import assert from "node:assert/strict";
import { withApp } from "./helpers/http.ts";

const postIntent = (url: string, body: unknown) =>
  fetch(url + "/api/intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("intención relaciona lenguaje libre con una expresión del catálogo", async () => {
  await withApp(
    {
      apiKey: "test",
      fetchImpl: async (url, options) => {
        assert.equal(url, "https://api.meta.ai/v1/chat/completions");
        const body = JSON.parse(String(options.body));
        assert.equal(body.response_format.type, "json_schema");
        assert.match(body.messages[0].content, /enrutador de intenciones/);
        assert.equal(body.messages[1].content, "todo salió muy bien, gracias");
        return Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  clase: "muybien",
                  confianza: 0.9,
                  motivo: "Expresa que todo salió muy bien",
                }),
              },
            },
          ],
        });
      },
    },
    async (url) => {
      const res = await postIntent(url, { text: "todo salió muy bien, gracias" });
      assert.equal(res.status, 200);
      const result = await res.json();
      assert.equal(result.id, "muybien");
      assert.equal(result.promptVersion, "lsc-intent-v1");
    },
  );
});

test("intención devuelve id nulo fuera del catálogo y rechaza ids inventados", async () => {
  await withApp(
    {
      apiKey: "test",
      fetchImpl: async () =>
        Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  clase: "fuera",
                  confianza: 0.8,
                  motivo: "Sin expresión equivalente",
                }),
              },
            },
          ],
        }),
    },
    async (url) => {
      const res = await postIntent(url, { text: "quiero una pizza" });
      assert.equal(res.status, 200);
      assert.equal((await res.json()).id, null);
    },
  );
  await withApp(
    {
      apiKey: "test",
      fetchImpl: async () =>
        Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  clase: "inventada",
                  confianza: 0.8,
                  motivo: "x",
                }),
              },
            },
          ],
        }),
    },
    async (url) => assert.equal((await postIntent(url, { text: "hola" })).status, 502),
  );
});

test("intención valida el texto y la clave sin contactar al proveedor", async () => {
  await withApp(
    {
      apiKey: "",
      fetchImpl: () => {
        throw new Error("No debe consultar proveedor");
      },
    },
    async (url) => {
      assert.equal((await postIntent(url, { text: "  " })).status, 400);
      assert.equal((await postIntent(url, { text: "hola" })).status, 503);
      assert.equal(
        (await postIntent(url, { text: "x".repeat(301) })).status,
        400,
      );
    },
  );
});

test("administración lista todas las definiciones y exige token si está configurado", async () => {
  await withApp({ apiKey: "test" }, async (url) => {
    const res = await fetch(url + "/api/admin/signs");
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.tokenRequired, false);
    assert.equal(data.signs.length, 33);
    assert.equal(data.signs.filter((s: { activa: boolean }) => s.activa).length, 11);
    assert.ok(data.signs.some((s: { id: string }) => s.id === "porfavor"));
  });
});

test("administración aplica parches sin cambio sin escribir y rechaza señas desconocidas", async () => {
  await withApp({ apiKey: "test" }, async (url) => {
    const before = await (
      await fetch(url + "/api/admin/signs")
    ).json();
    const si = before.signs.find((s: { id: string }) => s.id === "si");
    const res = await fetch(url + "/api/admin/signs/si", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activa: si.activa }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.changed, false);
    assert.equal(data.restartRequired, false);
    const missing = await fetch(url + "/api/admin/signs/noexiste", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activa: true }),
    });
    assert.equal(missing.status, 404);
    const invalid = await fetch(url + "/api/admin/signs/si", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ descripcion: "   " }),
    });
    assert.equal(invalid.status, 400);
  });
});
