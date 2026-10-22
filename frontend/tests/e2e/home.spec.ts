import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';

test('главная отрисовывается без загрузки Swagger', async ({ page }) => {
  const swaggerRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/docs/')) swaggerRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Поможем рассказать о доме главное');
  await expect(page.getByRole('main')).toBeVisible();
  expect(swaggerRequests).toEqual([]);
});

for (const width of [320, 479, 481, 768, 1440]) {
  test(`страница помещается в экран шириной ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  });
}

test('главная проходит проверку доступности', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
});
