import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const backendRoot = fileURLToPath(new URL("../../", import.meta.url));

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const nodeEnv = env.NODE_ENV || "development";
  if (!["development", "production", "test"].includes(nodeEnv))
    throw new Error("NODE_ENV debe ser development, production o test.");
  const production = nodeEnv === "production";
  const port = Number(env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT debe ser un puerto válido.");
  let origin: string | undefined;
  if (env.APP_ORIGIN) {
    const url = new URL(env.APP_ORIGIN);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
      throw new Error("APP_ORIGIN debe ser un origen HTTP(S), sin ruta ni credenciales.");
    origin = url.origin;
  }
  if (production && !origin)
    throw new Error("APP_ORIGIN es obligatorio en producción (ejemplo: https://dalo.example).");
  if (env.SERVE_FRONTEND && !["true", "false"].includes(env.SERVE_FRONTEND))
    throw new Error("SERVE_FRONTEND debe ser true o false.");
  return {
    nodeEnv,
    port,
    host: env.HOST || (production ? "0.0.0.0" : "127.0.0.1"),
    allowedOrigins: origin ? [origin] : ["http://localhost:4201", "http://127.0.0.1:4201"],
    serveFrontend: env.SERVE_FRONTEND ? env.SERVE_FRONTEND === "true" : production,
    frontendDist: resolve(backendRoot, env.FRONTEND_DIST || "../web-meta/dist/web-meta/browser"),
    apiKey: env.META_API_KEY ?? "",
    model: env.META_MODEL || "muse-spark-1.3-contributor",
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;
