import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config/environment.ts";
import { withApp } from "./helpers/http.ts";

test("producción sirve la SPA y la API conservando orígenes, errores y cabeceras", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dalo-web-"));
  try {
    await writeFile(join(directory, "index.html"), "<!doctype html><title>Daló</title>");
    await writeFile(join(directory, "main.js"), "console.log('Daló')");
    const config = loadConfig({ NODE_ENV: "production", APP_ORIGIN: "https://dalo.example", FRONTEND_DIST: directory });
    await withApp({}, async (url) => {
      for (const path of ["/", "/expresiones"]) {
        const response = await fetch(url + path, { headers: { Accept: "text/html" } });
        assert.equal(response.status, 200);
        assert.match(await response.text(), /<title>Daló/);
        assert.match(response.headers.get("cache-control") || "", /no-cache|no-store/);
      }
      assert.equal((await fetch(url + "/main.js")).status, 200);
      for (const path of ["/api/missing", "/api", "/missing.js", "/.env"]) {
        const response = await fetch(url + path);
        assert.equal(response.status, 404);
      }
      const allowed = await fetch(url + "/api/health", { headers: { Origin: "https://dalo.example" } });
      assert.equal(allowed.status, 200);
      assert.equal((await allowed.json()).configured, false);
      assert.equal(allowed.headers.get("cache-control"), "no-store");
      for (const origin of ["https://evil.example", "http://localhost:4201", "null"]) {
        assert.equal((await fetch(url + "/api/health", { headers: { Origin: origin } })).status, 403);
      }
    }, config);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("desarrollo no sirve archivos del frontend compilado", async () => {
  await withApp({}, async (url) => {
    assert.equal((await fetch(url + "/")).status, 404);
    assert.equal((await fetch(url + "/api/health", { headers: { Origin: "http://localhost:4201" } })).status, 200);
  }, loadConfig({ NODE_ENV: "development" }));
});
