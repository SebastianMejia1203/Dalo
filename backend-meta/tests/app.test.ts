import test from "node:test";
import assert from "node:assert/strict";
import { withApp } from "./helpers/http.ts";
const frame = "data:image/jpeg;base64,/9j/2Q==";
const post = (url: string, body: unknown) =>
  fetch(url + "/api/recognize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("Express conserva errores JSON, límites y rechazo de orígenes", async () => {
  await withApp(
    {
      apiKey: "test",
      fetchImpl: () => {
        throw new Error("No debe consultar proveedor");
      },
    },
    async (url) => {
      const invalid = await fetch(url + "/api/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      });
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).code, "INVALID_JSON");
      const oversized = await post(url, {
        frames: [],
        padding: "x".repeat(6 * 1024 * 1024),
      });
      assert.equal(oversized.status, 413);
      assert.equal((await oversized.json()).code, "TOO_LARGE");
      const forbidden = await fetch(url + "/api/health", {
        headers: { Origin: "https://example.com" },
      });
      assert.equal(forbidden.status, 403);
      assert.equal((await forbidden.json()).code, "ORIGIN");
      assert.equal(forbidden.headers.has("x-powered-by"), false);
      assert.equal((await fetch(url + "/api/missing")).status, 404);
    },
  );
});

test("el endpoint sin streaming usa el esquema y las clases inyectados", async () => {
  const spec = {
    prompt: "Prueba",
    description: "Prueba",
    promptVersion: "test",
    classes: ["nueva", "otra"],
    schema: {
      type: "object",
      properties: { clase: { enum: ["nueva", "otra"] } },
    },
  };
  await withApp(
    {
      apiKey: "test",
      recognitionSpec: spec,
      fetchImpl: async (_url, options) => {
        assert.deepEqual(
          JSON.parse(String(options.body)).response_format.json_schema.schema,
          spec.schema,
        );
        return Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: '{"clase":"nueva","confianza":0.8,"motivo":"Prueba"}',
              },
            },
          ],
        });
      },
    },
    async (url) =>
      assert.equal(
        (await (await post(url, { frames: Array(8).fill(frame) })).json())
          .clase,
        "nueva",
      ),
  );
});

test("expone el contexto real sin claves ni etiqueta esperada", async () => {
  await withApp({ apiKey: "SECRETO" }, async (url) => {
    const response = await fetch(url + "/api/context");
    assert.equal(response.status, 200);
    const context = await response.json();
    assert.equal(context.catalog.length, 11);
    assert.ok(context.catalog.some((sign: { id: string }) => sign.id === "muybien"));
    assert.match(context.instructions, /Colombiana/);
    assert.match(context.instructions, /otra/);
    assert.equal(JSON.stringify(context).includes("SECRETO"), false);
  });
});

test("stream entrega progreso antes del resultado y solo resúmenes públicos", async () => {
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const fixture = { clase: "hola", confianza: 0.8, motivo: "Mano visible" };
  await withApp(
    {
      apiKey: "test",
      fetchImpl: async (url, options) => {
        assert.equal(url, "https://api.meta.ai/v1/responses");
        const body = JSON.parse(String(options.body));
        assert.equal(body.stream, true);
        assert.equal(body.reasoning.summary, "auto");
        assert.equal(body.text.format.type, "json_schema");
        assert.equal(
          body.input[0].content.filter(
            (x: { type: string }) => x.type === "input_image",
          ).length,
          8,
        );
        return new Response(
          new ReadableStream({
            async start(controller) {
              const send = (value: unknown) =>
                controller.enqueue(
                  new TextEncoder().encode(
                    "data: " + JSON.stringify(value) + "\r\n\r\n",
                  ),
                );
              send({ type: "response.created" });
              send({
                type: "response.reasoning_summary_text.delta",
                delta: "Se observan manos.",
              });
              send({ type: "response.reasoning_text.delta", delta: "PRIVADO" });
              await gate;
              send({
                type: "response.completed",
                response: {
                  status: "completed",
                  output: [
                    {
                      type: "message",
                      content: [
                        { type: "output_text", text: JSON.stringify(fixture) },
                      ],
                    },
                  ],
                },
              });
              controller.close();
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        );
      },
    },
    async (url) => {
      const response = await fetch(url + "/api/recognize/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames: Array(8).fill(frame) }),
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /ndjson/);
      const reader = response.body!.getReader();
      let text = "";
      try {
        while (!text.includes("Se observan manos."))
          text += new TextDecoder().decode((await reader.read()).value);
        assert.equal(text.includes('"type":"result"'), false);
        finish();
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          text += new TextDecoder().decode(chunk.value);
        }
        assert.equal(text.includes("PRIVADO"), false);
        const events = text
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
        assert.equal(events.at(-1).type, "result");
        assert.equal(events.at(-1).result.clase, "hola");
      } finally {
        finish();
        await reader.cancel();
      }
    },
  );
});

test("un stream truncado o fallido no produce resultado ni error secreto", async () => {
  for (const event of [
    { type: "response.output_text.delta", delta: "{" },
    { type: "response.failed", response: { error: { message: "SECRETO" } } },
  ]) {
    await withApp(
      {
        apiKey: "test",
        fetchImpl: async () =>
          new Response("data: " + JSON.stringify(event) + "\n\n"),
      },
      async (url) => {
        const response = await fetch(url + "/api/recognize/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ frames: Array(8).fill(frame) }),
        });
        const text = await response.text();
        assert.match(text, /"type":"error"/);
        assert.equal(text.includes('"type":"result"'), false);
        assert.equal(text.includes("SECRETO"), false);
      },
    );
  }
});
test("sin clave informa configuración pendiente y no simula reconocimiento", async () => {
  await withApp({ apiKey: "" }, async (url) => {
    assert.equal(
      (await (await fetch(url + "/api/health")).json()).configured,
      false,
    );
    const res = await post(url, { frames: Array(8).fill(frame) });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).code, "API_KEY_MISSING");
  });
});
test("rechaza captura vacía sin contactar proveedor", async () => {
  await withApp({ apiKey: "test" }, async (url) =>
    assert.equal((await post(url, { frames: [] })).status, 400),
  );
});
test("clasifica por HTTP con salida estructurada y no envía etiqueta esperada", async () => {
  await withApp(
    {
      apiKey: "test",
      fetchImpl: async (url, options) => {
        assert.equal(url, "https://api.meta.ai/v1/chat/completions");
        const body = JSON.parse(String(options.body));
        assert.equal(
          body.messages[1].content.filter(
            (x: { type: string }) => x.type === "image_url",
          ).length,
          8,
        );
        assert.equal(body.response_format.type, "json_schema");
        assert.equal(JSON.stringify(body).includes("ETIQUETA_SECRETA"), false);
        return Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  clase: "hola",
                  confianza: 0.8,
                  motivo: "Movimiento visible",
                }),
              },
            },
          ],
        });
      },
    },
    async (url) => {
      const res = await post(url, {
        frames: Array(8).fill(frame),
        expected: "ETIQUETA_SECRETA",
      });
      assert.equal(res.status, 200);
      const result = await res.json();
      assert.equal(result.clase, "hola");
      assert.equal(result.model, "muse-spark-1.3-contributor");
      assert.equal(typeof result.latencyMs, "number");
    },
  );
});

test("video de cámara se normaliza y se envía a Meta a 12 fps", async () => {
  let converted = false,
    video: unknown;
  await withApp(
    {
      apiKey: "test",
      convertVideo: async (value) => {
        assert.equal(value, "data:video/webm;base64,AAAA");
        converted = true;
        return "data:video/mp4;base64,BBBB";
      },
      fetchImpl: async (_url, options) => {
        video = JSON.parse(String(options.body)).input[0].content[1];
        return new Response(
          "data: " +
            JSON.stringify({
              type: "response.completed",
              response: {
                status: "completed",
                output: [
                  {
                    type: "message",
                    content: [
                      {
                        type: "output_text",
                        text: '{"clase":"otra","confianza":0.2,"motivo":"Prueba"}',
                      },
                    ],
                  },
                ],
              },
            }) +
            "\n\n",
        );
      },
    },
    async (url) => {
      const response = await fetch(url + "/api/recognize/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoDataUrl: "data:video/webm;base64,AAAA" }),
      });
      assert.equal(response.status, 200);
      assert.match(await response.text(), /"type":"result"/);
    },
  );
  assert.equal(converted, true);
  assert.deepEqual(video, {
    type: "input_video",
    video_url: "data:video/mp4;base64,BBBB",
    fps: 12,
  });
});
for (const output of [
  { clase: "inventada", confianza: 0.9, motivo: "x" },
  { clase: "hola", confianza: 2, motivo: "x" },
]) {
  test(
    "rechaza respuesta inválida del proveedor " + JSON.stringify(output),
    async () => {
      await withApp(
        {
          apiKey: "test",
          fetchImpl: async () =>
            Response.json({
              choices: [
                {
                  finish_reason: "stop",
                  message: { content: JSON.stringify(output) },
                },
              ],
            }),
        },
        async (url) =>
          assert.equal(
            (await post(url, { frames: Array(8).fill(frame) })).status,
            502,
          ),
      );
    },
  );
}
test("acepta otra como rechazo y conserva baja confianza sin confirmarla", async () => {
  await withApp(
    {
      apiKey: "test",
      fetchImpl: async () =>
        Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content:
                  '{"clase":"otra","confianza":0.2,"motivo":"Sin seña clara"}',
              },
            },
          ],
        }),
    },
    async (url) => {
      const res = await post(url, { frames: Array(8).fill(frame) });
      assert.equal((await res.json()).clase, "otra");
    },
  );
});
test("no expone errores ni credenciales del proveedor", async () => {
  await withApp(
    {
      apiKey: "SECRETO",
      fetchImpl: async () => new Response("SECRETO", { status: 401 }),
    },
    async (url) => {
      const res = await post(url, { frames: Array(8).fill(frame) });
      assert.equal(res.status, 502);
      assert.equal((await res.text()).includes("SECRETO"), false);
    },
  );
});
test("abortar cliente cancela proveedor y libera el siguiente análisis", async () => {
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  let aborted!: () => void;
  const cancelled = new Promise<void>((resolve) => {
    aborted = resolve;
  });
  await withApp(
    {
      apiKey: "test",
      fetchImpl: async (_url, options) => {
        started();
        return new Promise((_resolve, reject) =>
          options.signal!.addEventListener(
            "abort",
            () => {
              aborted();
              reject(options.signal!.reason);
            },
            { once: true },
          ),
        );
      },
    },
    async (url) => {
      const controller = new AbortController();
      const pending = fetch(url + "/api/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames: Array(8).fill(frame) }),
        signal: controller.signal,
      }).catch(() => {});
      await ready;
      controller.abort();
      await pending;
      await Promise.race([
        cancelled,
        new Promise((_, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Proveedor no cancelado")),
            1000,
          );
          timer.unref();
        }),
      ]);
    },
  );
});
