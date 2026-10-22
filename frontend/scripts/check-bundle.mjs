import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const dist = new URL('../dist/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('.vite/manifest.json', dist), 'utf8'));
const budget = JSON.parse(await readFile(new URL('../bundle-budget.json', import.meta.url), 'utf8'));
const visited = new Set();
const files = new Set();

function collect(key) {
  if (visited.has(key)) return;
  visited.add(key);
  const chunk = manifest[key];
  if (!chunk) throw new Error(`Отсутствует модуль ${key}`);
  files.add(chunk.file);
  for (const file of chunk.css ?? []) files.add(file);
  for (const dependency of chunk.imports ?? []) collect(dependency);
}

collect('index.html');
const sizes = { js: 0, css: 0 };
for (const file of files) {
  const extension = file.endsWith('.js') ? 'js' : file.endsWith('.css') ? 'css' : undefined;
  if (extension) sizes[extension] += gzipSync(await readFile(new URL(file, dist))).length;
}

const result = Object.entries(sizes).map(([type, bytes]) => ({ type, bytes, limit: budget[type], passed: bytes <= budget[type] }));
const output = new URL('../test-results/', import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL('bundle.json', output), JSON.stringify(result, null, 2) + '\n');
for (const row of result) console.log(`${row.type}: ${row.bytes} / ${row.limit} байт gzip`);
if (result.some((row) => !row.passed)) process.exitCode = 1;
