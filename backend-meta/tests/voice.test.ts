import test from "node:test";
import assert from "node:assert/strict";
import { withApp } from "./helpers/http.ts";

const wav = () => {
  const b = Buffer.alloc(44 + 3200);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(3200, 40);
  return b;
};
const post = (url: string, body: Buffer) =>
  fetch(url + "/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": "audio/wav" },
    body: new Uint8Array(body),
  });
test("dictado rechaza audio inválido sin llamar al proveedor", async () => {
  await withApp({ apiKey: "test" }, async (url) =>
    assert.equal((await post(url, Buffer.from("not-wav"))).status, 400),
  );
});
test("dictado usa Voice Transcribe, WAV mono y contexto de español", async () => {
  let options!: RequestInit;
  await withApp(
    {
      apiKey: "test",
      fetchImpl: async (url, input) => {
        assert.equal(url, "https://api.meta.ai/v1/asr/transcribe");
        options = input;
        return Response.json({
          sessionId: "voice-test",
          transcript: "Hola, gracias.",
          audioDurationMs: 100,
          turns: [],
        });
      },
    },
    async (url) => {
      const response = await post(url, wav());
      assert.equal(response.status, 200);
      const output = await response.json();
      assert.equal(output.transcript, "Hola, gracias.");
      assert.equal(output.model, "muse-voice-transcribe-1.0");
    },
  );
  const request = JSON.parse(
    await ((options.body as FormData).get("request") as Blob).text(),
  );
  assert.equal(request.model, "muse-voice-transcribe-1.0");
  assert.equal(request.mode, "PUSH_TO_TALK");
  assert.deepEqual(request.languageBias, ["Spanish"]);
  assert.equal(
    ((options.body as FormData).get("audio") as Blob).type,
    "audio/wav",
  );
  assert.equal(
    (options.headers as Record<string, string>).Authorization,
    "Bearer test",
  );
});
test("dictado no devuelve errores privados del proveedor", async () => {
  await withApp(
    {
      apiKey: "test",
      fetchImpl: async () => new Response("SECRETO", { status: 401 }),
    },
    async (url) => {
      const response = await post(url, wav());
      assert.equal(response.status, 502);
      assert.equal((await response.text()).includes("SECRETO"), false);
    },
  );
});
