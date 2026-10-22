import { defineConfig, devices } from '@playwright/test';

const externalURL = process.env.E2E_BASE_URL;

if (process.argv.some((argument) => argument.startsWith('--update-snapshots') && argument !== '--update-snapshots=none')) {
  if (process.platform !== 'linux' || process.arch !== 'arm64') {
    throw new Error('Эталоны обновляются в Linux ARM64 через workflow Update screenshots.');
  }
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  failOnFlakyTests: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  globalTimeout: 5 * 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  snapshotPathTemplate: '{testDir}/screenshots/{projectName}/{arg}{ext}',
  updateSnapshots: 'none',
  expect: {
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixels: 0 },
  },
  use: {
    baseURL: externalURL ?? 'http://127.0.0.1:4173',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    colorScheme: 'light',
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'firefox', testIgnore: '**/visual.spec.ts', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testIgnore: '**/visual.spec.ts', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: externalURL ? undefined : {
    command: 'npm run preview -- --host 0.0.0.0 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
