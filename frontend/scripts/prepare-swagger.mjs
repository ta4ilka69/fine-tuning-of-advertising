import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const source = dirname(require.resolve('swagger-ui-dist/package.json'));
const destination = fileURLToPath(new URL('../public/docs/vendor/', import.meta.url));

await mkdir(destination, { recursive: true });
await Promise.all(
  [
    'swagger-ui-bundle.js',
    'swagger-ui-bundle.js.LICENSE.txt',
    'swagger-ui.css',
    'LICENSE',
    'NOTICE',
  ].map((file) =>
    copyFile(resolve(source, file), resolve(destination, file)),
  ),
);
