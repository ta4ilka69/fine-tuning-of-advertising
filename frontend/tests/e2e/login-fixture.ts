import { test as base, expect } from './fixtures';
import { startSessionServer } from './session-server';

export const test = base.extend<{ loginServer: Awaited<ReturnType<typeof startSessionServer>> }>({
  loginServer: async ({ page }, provide) => {
    const server = await startSessionServer();
    try { await provide(server); } finally { await page.goto('about:blank'); await server.close(); }
  },
});
export { expect };
