import { test, expect } from './fixtures';

test('Swagger загружает контракт и показывает операции', async ({ page }) => {
  const [response] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/docs/openapi.json')),
    page.goto('/docs/'),
  ]);
  expect(response.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Докрутка объявления API');
  await page.getByRole('heading', { name: /^Аккаунт/ }).getByRole('button', { name: 'Expand operation' }).click();
  await expect(page.locator('.opblock').first()).toBeVisible();
  await expect(page.locator('.swagger-ui .errors-wrapper')).toHaveCount(0);
});
