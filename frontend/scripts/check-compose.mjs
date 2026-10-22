import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const baseURL = process.env.COMPOSE_BASE_URL ?? 'http://127.0.0.1:8088';
const contract = JSON.parse(await readFile(new URL('../public/docs/openapi.json', import.meta.url), 'utf8'));

async function get(path, options) {
  const response = await fetch(new URL(path, baseURL), { signal: AbortSignal.timeout(10_000), ...options });
  console.log(`${path}: ${response.status}`);
  return response;
}

for (const path of ['/', '/docs/', '/docs/vendor/swagger-ui-bundle.js', '/docs/vendor/swagger-ui.css', '/docs/vendor/LICENSE', '/docs/vendor/NOTICE', '/docs/vendor/swagger-ui-bundle.js.LICENSE.txt']) {
  assert.equal((await get(path)).status, 200, path);
}

for (const path of ['/health', '/api/health']) {
  const response = await get(path);
  assert.equal(response.status, 200, path);
  assert.equal((await response.json()).status, 'ok', path);
}

const redirect = await get('/docs', { redirect: 'manual' });
assert.equal(redirect.status, 308);
assert.equal(redirect.headers.get('location'), '/docs/');
assert.equal((await get('/docs/not-found.js')).status, 404);
assert.equal((await get('/assets/not-found.js')).status, 404);
const response = await get('/docs/openapi.json');
assert.equal(response.status, 200);
assert.match(response.headers.get('content-type') ?? '', /application\/json/);
assert.deepEqual(await response.json(), contract);
