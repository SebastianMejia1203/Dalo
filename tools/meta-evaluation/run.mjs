import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
  existsSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { streamRecognition } from "../../backend-meta/dist/modules/recognition/recognition.stream.js";
import {
  prompt,
  schema,
  classes,
  promptVersion,
  catalog,
} from "../../backend-meta/dist/modules/signs/sign.schema.js";
import { openSpec } from "./spec.mjs";

const directory = resolve(
  process.argv[2] || "data/meta-evaluation/2026-10-29-cordialidad",
);
const concurrency = Number(process.argv[3] || 4);
if (!process.env.META_API_KEY?.trim()) throw new Error("META_API_KEY missing");
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 6)
  throw new Error("Concurrency must be 1–6");
const manifest = JSON.parse(readFileSync(join(directory, "manifest.json")));
const model = process.env.META_MODEL || "muse-spark-1.3-contributor";
const closedSpec = manifest.closedSpec ?? {
  prompt,
  schema,
  classes,
  promptVersion,
  description: `LSC, ${catalog.length} clases y rechazo con otra`,
};
for (const name of ["logs", "results", "requests"])
  mkdirSync(join(directory, name), { recursive: true });
const contexts = { model, closed: closedSpec, open: openSpec };
const contextFile = join(directory, "contexts.json");
if (
  existsSync(contextFile) &&
  JSON.stringify(JSON.parse(readFileSync(contextFile))) !==
    JSON.stringify(contexts)
)
  throw new Error(
    "Configuration differs from saved experiment. Use a new output directory.",
  );
writeFileSync(contextFile, JSON.stringify(contexts, null, 2));
const byId = new Map(manifest.samples.map((sample) => [sample.id, sample]));
// Round robin avoids class-order bias in progress reports; every request is stateless.
const queues = new Map();
for (const task of manifest.tasks.filter(
  (x) => x.kind === "frames" && x.sampleId !== "outside-0001",
)) {
  if (!queues.has(task.expected)) queues.set(task.expected, []);
  queues.get(task.expected).push(task);
}
const ordered = manifest.tasks.filter(
  (x) => x.kind === "video" || x.sampleId === "outside-0001",
);
while ([...queues.values()].some((queue) => queue.length))
  for (const queue of queues.values())
    if (queue.length) ordered.push(queue.shift());
const tasks = ordered.filter(
  (task) => !existsSync(join(directory, "results", task.id + ".json")),
);
let cursor = 0,
  complete = manifest.tasks.length - tasks.length,
  successful = 0,
  errors = 0,
  correct = 0,
  abort = false;
const started = performance.now();
const logProgress = () =>
  console.log(
    JSON.stringify({
      completed: complete,
      total: manifest.tasks.length,
      okThisRun: successful,
      errorsThisRun: errors,
      exactMatchesThisRun: correct,
      elapsedSeconds: Math.round((performance.now() - started) / 1000),
    }),
  );
console.log(
  JSON.stringify({
    event: "start",
    pending: tasks.length,
    concurrency,
    model,
    directory,
  }),
);

async function run(task) {
  const sample = byId.get(task.sampleId),
    spec = task.scope === "open" ? openSpec : closedSpec;
  const folder = join(directory, "samples", sample.id);
  const frames =
    task.kind === "frames"
      ? sample.frames.map(
          (frame) =>
            "data:image/jpeg;base64," +
            readFileSync(join(folder, frame.file)).toString("base64"),
        )
      : [];
  const videoDataUrl =
    task.kind === "video"
      ? "data:video/mp4;base64," +
        readFileSync(join(folder, "full.mp4")).toString("base64")
      : undefined;
  const logFile = join(directory, "logs", task.id + ".jsonl");
  const record = (event) =>
    appendFileSync(
      logFile,
      JSON.stringify({ timestamp: new Date().toISOString(), ...event }) + "\n",
    );
  writeFileSync(
    join(directory, "requests", task.id + ".json"),
    JSON.stringify(
      {
        model,
        scope: task.scope,
        kind: task.kind,
        promptVersion: spec.promptVersion,
        instructions: spec.prompt,
        task:
          spec.task ?? "Clasifica esta secuencia cronológica de una seña LSC.",
        schema: spec.schema,
        videoSamplingFps: task.videoFps ?? null,
        input:
          task.kind === "frames"
            ? sample.frames.map((frame) => ({
                file: `samples/${sample.id}/${frame.file}`,
                index: frame.index,
                seconds: frame.seconds,
                sha256: frame.sha256,
              }))
            : [
                {
                  file: `samples/${sample.id}/full.mp4`,
                  sha256: createHash("sha256")
                    .update(readFileSync(join(folder, "full.mp4")))
                    .digest("hex"),
                },
              ],
        note: "Local media references replace data URLs here. No source filename, expected label, participant, or path is sent to Meta.",
      },
      null,
      2,
    ),
  );
  let result = null,
    providerStatus = null,
    lastError = "No result",
    attempts = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    attempts = attempt;
    providerStatus = null;
    record({ type: "attempt", attempt });
    let buffer = "";
    const controller = new AbortController();
    const response = {
      destroyed: false,
      writeHead() {},
      flushHeaders() {},
      end() {},
      write(chunk) {
        buffer += chunk;
        let index;
        while ((index = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 1);
          if (!line) continue;
          const event = JSON.parse(line);
          record(event);
          if (event.type === "result") result = event.result;
          if (event.type === "error") lastError = event.message;
        }
      },
    };
    await streamRecognition({
      res: response,
      frames,
      videoDataUrl,
      videoFps: task.videoFps,
      spec,
      model,
      apiKey: process.env.META_API_KEY,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]),
      start: performance.now(),
      fetchImpl: async (url, options) => {
        const provider = await fetch(url, options);
        providerStatus = provider.status;
        record({
          type: "provider_http",
          status: provider.status,
          requestId: provider.headers.get("x-request-id"),
        });
        return provider;
      },
    });
    if (result) break;
    if (providerStatus === 401 || providerStatus === 403) {
      abort = true;
      break;
    }
    if (
      attempt < 3 &&
      (providerStatus === 429 ||
        providerStatus === 503 ||
        providerStatus === 502 ||
        providerStatus === null)
    ) {
      const waitMs = providerStatus === 429 ? 30000 : 5000 * attempt;
      record({ type: "retry_wait", waitMs });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    } else break;
  }
  const saved = {
    id: task.id,
    sampleId: sample.id,
    expected: task.expected,
    source: sample.source,
    scope: task.scope,
    kind: task.kind,
    videoSamplingFps: task.videoFps ?? null,
    attempts,
    status: result ? "ok" : "error",
    providerStatus,
    result,
    error: result ? null : lastError,
    exactMatch: result
      ? task.expected
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .toLowerCase() ===
        result.clase
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .toLowerCase()
      : null,
    finishedAt: new Date().toISOString(),
  };
  writeFileSync(
    join(directory, "results", task.id + ".json"),
    JSON.stringify(saved, null, 2),
  );
  appendFileSync(
    join(directory, "results.jsonl"),
    JSON.stringify(saved) + "\n",
  );
  complete++;
  if (result) {
    successful++;
    if (saved.exactMatch) correct++;
  } else errors++;
  if (
    complete % 10 === 0 ||
    task.sampleId === "outside-0001" ||
    task.kind === "video"
  )
    logProgress();
}
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (cursor < tasks.length && !abort) {
      const task = tasks[cursor++];
      await run(task);
    }
  }),
);
logProgress();
console.log(
  JSON.stringify({
    event: abort ? "stopped_authentication" : "finished",
    finishedAt: new Date().toISOString(),
  }),
);
if (abort) process.exitCode = 1;
