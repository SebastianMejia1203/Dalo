const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { parseEnv } = require('node:util');

// Misma precedencia que el backend: proceso > .env.development > .env.
const local = {};
for (const name of ['.env', '.env.development']) {
  try {
    Object.assign(local, parseEnv(readFileSync(resolve(__dirname, '../backend-meta', name), 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const env = { ...local, ...process.env };
const host = !env.HOST || ['0.0.0.0', '::'].includes(env.HOST) ? '127.0.0.1' : env.HOST;
const target = process.env.API_PROXY_TARGET || `http://${host.includes(':') ? `[${host}]` : host}:${env.PORT || 3001}`;

module.exports = { '/api/**': { target } };
