import { test, expect } from './fixtures';

test.describe.configure({ retries: 0 });

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 360, height: 800 },
]) {
  test(`главная ${viewport.name} @visual`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await expect(page.getByRole('main')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`home-${viewport.name}.png`, { fullPage: true });
  });
}
