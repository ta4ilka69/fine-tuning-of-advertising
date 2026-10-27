import { test, expect } from './fixtures';

test.describe.configure({ retries: 0 });

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 360, height: 800 },
  { name: 'narrow', width: 320, height: 900 },
]) {
  test(`главная ${viewport.name} @visual`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await expect(page.getByRole('main')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`home-${viewport.name}.png`, { fullPage: true });
  });
}

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'narrow', width: 320, height: 900 },
]) {
  test(`компоненты ${viewport.name} @visual`, async ({ page }) => {
    const { openUIFixture } = await import('./ui-fixture');
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openUIFixture(page, 'admin');
    await expect(page).toHaveScreenshot(`ui-${viewport.name}.png`, { fullPage: true });
  });
}

test('наведение и фокус @visual', async ({ page }) => {
  const { openUIFixture } = await import('./ui-fixture');
  await openUIFixture(page);
  await page.getByRole('button', { name: 'Основная', exact: true }).hover();
  await page.getByRole('textbox', { name: 'Адрес', exact: true }).focus();
  await expect(page).toHaveScreenshot('ui-focus-hover.png', { fullPage: true });
});

test('нажатие кнопки @visual', async ({ page }) => {
  const { openUIFixture } = await import('./ui-fixture');
  await openUIFixture(page);
  await page.getByRole('button', { name: 'Основная', exact: true }).focus();
  await page.keyboard.down('Space');
  try {
    await expect(page.getByRole('region', { name: 'Кнопки', exact: true })).toHaveScreenshot('ui-pressed.png');
  } finally {
    await page.keyboard.up('Space');
  }
});
