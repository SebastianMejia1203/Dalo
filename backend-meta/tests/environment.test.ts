import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config/environment.ts";

test("desarrollo escucha localmente y producción permite el dominio configurado", () => {
  const development = loadConfig({});
  assert.equal(development.nodeEnv, "development");
  assert.equal(development.host, "127.0.0.1");
  assert.equal(development.serveFrontend, false);
  const production = loadConfig({ NODE_ENV: "production", APP_ORIGIN: "https://dalo.example" });
  assert.equal(production.host, "0.0.0.0");
  assert.equal(production.serveFrontend, true);
  assert.deepEqual(production.allowedOrigins, ["https://dalo.example"]);
});

test("valida el entorno, puerto, origen y opciones antes de arrancar", () => {
  for (const env of [
    { NODE_ENV: "staging" },
    { PORT: "0" },
    { NODE_ENV: "production" },
    { APP_ORIGIN: "https://dalo.example/ruta" },
    { APP_ORIGIN: "*" },
    { SERVE_FRONTEND: "yes" },
  ]) assert.throws(() => loadConfig(env));
  const config = loadConfig({ HOST: "127.0.0.1", PORT: "8000", SERVE_FRONTEND: "false", NODE_ENV: "production", APP_ORIGIN: "https://dalo.example/" });
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 8000);
  assert.equal(config.serveFrontend, false);
  assert.deepEqual(config.allowedOrigins, ["https://dalo.example"]);
});
