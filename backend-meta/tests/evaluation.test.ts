import test from "node:test";
import assert from "node:assert/strict";
import { streamRecognition } from "../src/modules/recognition/recognition.stream.ts";
import { openSpec } from "./fixtures/open-spec.ts";

test("evaluación abierta no filtra catálogo y acepta una etiqueta fuera de él", async () => {
  const output: string[] = [];
  await streamRecognition({
    res: {
      writeHead() {},
      flushHeaders() {},
      write(value) {
        output.push(value);
      },
      end() {},
    },
    frames: ["data:image/jpeg;base64,AAAA"],
    model: "muse-spark-1.3",
    apiKey: "test",
    start: performance.now(),
    signal: new AbortController().signal,
    spec: openSpec,
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(String(options.body));
      assert.equal(request.instructions.includes("Catálogo cerrado"), false);
      assert.equal(request.text.format.schema.properties.clase.enum, undefined);
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
                      text: '{"clase":"Ayudar","confianza":0.8,"motivo":"Evidencia"}',
                    },
                  ],
                },
              ],
            },
          }) +
          "\n\n",
      );
    },
  });
  const events = output
    .join("")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(events.at(-1).result?.clase, "Ayudar");
  assert.equal(events.at(-1).result?.promptVersion, "lsc-open-zero-shot-v1");
});

test("comparación de video envía video nativo sin nombre de archivo ni etiqueta", async () => {
  let content!: unknown[];
  await streamRecognition({
    res: { writeHead() {}, flushHeaders() {}, write() {}, end() {} },
    frames: [],
    videoDataUrl: "data:video/mp4;base64,AAAA",
    videoFps: 12,
    model: "muse-spark-1.3",
    apiKey: "test",
    start: performance.now(),
    signal: new AbortController().signal,
    fetchImpl: async (_url, options) => {
      content = JSON.parse(String(options.body)).input[0].content;
      return new Response(
        "data: " + JSON.stringify({ type: "response.failed" }) + "\n\n",
      );
    },
  });
  assert.deepEqual(content[1], {
    type: "input_video",
    video_url: "data:video/mp4;base64,AAAA",
    fps: 12,
  });
});
