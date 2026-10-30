import { createServer } from "node:http";
import { createApp } from "./app.ts";
import { loadConfig } from "./config/environment.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";
process.env.NODE_ENV ||= process.argv.includes("--development") ? "development" : "production";
const config = loadConfig();
const { port, host } = config;
if (config.serveFrontend && !existsSync(join(config.frontendDist, "index.html")))
  throw new Error("No existe el frontend compilado. Ejecuta npm run build en web-meta/ o configura FRONTEND_DIST.");
const server = createServer(createApp({}, config));
server.requestTimeout = 75000;
server.listen(port, host, () =>
  console.log(
    `Daló (${config.nodeEnv}): http://${host}:${port} · clave ${config.apiKey.trim() ? "configurada" : "pendiente"}`,
  ),
);
for (const event of ["SIGINT", "SIGTERM"])
  process.once(event, () => server.close());
