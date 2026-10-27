import { fileURLToPath } from 'node:url';
import { build } from 'vite';

export default async function buildUIFixture() {
  await build({ configFile: fileURLToPath(new URL('../ui/vite.config.ts', import.meta.url)), logLevel: 'warn' });
}
