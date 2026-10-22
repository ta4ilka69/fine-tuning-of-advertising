import { test as base, expect } from '@playwright/test';
import verifyScreenshotEnvironment from './global-setup';

export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [async ({ page }, use, testInfo) => {
    verifyScreenshotEnvironment(testInfo.config);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await use(errors);
    expect(errors).toEqual([]);
  }, { auto: true }],
});

export { expect } from '@playwright/test';
