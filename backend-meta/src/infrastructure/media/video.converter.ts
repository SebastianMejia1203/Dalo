import type { SpawnOptionsWithoutStdio } from "node:child_process";
import type { EventEmitter } from "node:events";
export interface VideoProcess extends EventEmitter {
  stdout: EventEmitter;
  stderr: { resume(): unknown };
  stdin: EventEmitter & { end(): unknown };
  kill(): unknown;
}
export type VideoSpawner = (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
) => VideoProcess;
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Normalize browser video to bounded, silent MP4; private temp input is removed. */
export async function normalizeVideo(
  dataUrl: string,
  signal: AbortSignal,
  spawnImpl: VideoSpawner = spawn,
) {
  const match = /^data:video\/(webm|mp4);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
    dataUrl,
  );
  if (!match) throw new Error("Invalid video");
  const input = Buffer.from(match[2], "base64");
  const directory = await mkdtemp(join(tmpdir(), "dalo-video-"));
  const inputPath = join(directory, `input.${match[1]}`);
  try {
    await writeFile(inputPath, input);
    return await new Promise<string>((resolve, reject) => {
      const child = spawnImpl(
        process.env.FFMPEG_PATH || "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          inputPath,
          "-t",
          "5",
          "-an",
          "-vf",
          "scale=w=min(640\\,iw):h=-2",
          "-r",
          "12",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "frag_keyframe+empty_moov",
          "-f",
          "mp4",
          "pipe:1",
        ],
        {
          windowsHide: true,
          signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
        },
      );
      const chunks: Buffer[] = [];
      let size = 0,
        failure: Error | null = null;
      child.stdout.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) {
          failure = new Error("Video demasiado grande.");
          child.kill();
        } else chunks.push(chunk);
      });
      child.stderr.resume();
      child.stdin.on("error", () => {});
      child.on("error", () => {
        failure = new Error(
          "No se pudo convertir el video. Comprueba FFmpeg en el backend.",
        );
      });
      child.on("close", (code: number | null) => {
        if (failure) reject(failure);
        else if (code === 0 && size > 0)
          resolve(
            "data:video/mp4;base64," + Buffer.concat(chunks).toString("base64"),
          );
        else reject(new Error("Video inválido o conversión fallida."));
      });
      child.stdin.end();
    });
  } finally {
    await unlink(inputPath).catch(() => {});
    await rmdir(directory).catch(() => {});
  }
}
