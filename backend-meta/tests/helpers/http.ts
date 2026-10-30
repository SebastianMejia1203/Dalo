import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../../src/app.ts";
import type { AppConfig } from "../../src/config/environment.ts";
import type { RecognitionDependencies } from "../../src/modules/recognition/recognition.types.ts";
export async function withApp(
  options: Partial<RecognitionDependencies>,
  run: (url: string) => Promise<unknown>,
  config?: AppConfig,
): Promise<void> {
  const server = createServer(createApp(options, config));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
