import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import type { VideoProcess } from "../src/infrastructure/media/video.converter.ts";
import { normalizeVideo } from "../src/infrastructure/media/video.converter.ts";

test("no borra el video privado hasta que el proceso de conversión se cierra", async () => {
  let ready!: () => void;
  let inputPath = "";
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const child: VideoProcess = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: { resume() {} },
    stdin: Object.assign(new EventEmitter(), { end() {} }),
    kill() {},
  });
  const pending = normalizeVideo(
    "data:video/webm;base64,AAAA",
    new AbortController().signal,
    (_command, args) => {
      inputPath = args[args.indexOf("-i") + 1];
      ready();
      return child;
    },
  );
  let settled = false;
  pending.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await started;
  try {
    child.emit("error", new Error("Abort"));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    assert.equal(settled, false);
    assert.equal(existsSync(inputPath), true);
  } finally {
    child.emit("close", 1);
    await pending.catch(() => {});
  }
  assert.equal(existsSync(inputPath), false);
});
