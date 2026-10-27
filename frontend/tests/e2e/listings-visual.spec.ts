import { test, expect } from './login-fixture';
import { listingItems } from '../fixtures/listings';

test.describe.configure({ retries: 0 });
for (const state of ['desktop', 'mobile', 'empty', 'mobile-empty', 'loading', 'error'] as const) {
  test(`список объявлений ${state} @visual`, async ({ page, context, loginServer }) => {
    await context.addCookies([{ name: 'session', value: 'test-session', url: `${loginServer.url}/api/v1` }]);
    await page.setViewportSize({ width: state.startsWith('mobile') ? 390 : 1440, height: 900 });
    if (state === 'desktop' || state === 'mobile') loginServer.controls.listingPages = [{ items: listingItems, nextCursor: null }];
    if (state === 'loading') loginServer.controls.holdListings = new Promise(() => {});
    if (state === 'error') loginServer.controls.listingError = 503;
    await page.goto(`${loginServer.url}/app`);
    await expect(page.getByRole('heading', { name: 'Мои объявления' })).toBeVisible();
    if (state === 'desktop' || state === 'mobile') await expect(page.getByRole('listitem')).toHaveCount(5);
    else if (state.includes('empty')) await expect(page.getByText('Пока нет объявлений')).toBeVisible();
    else if (state === 'error') await expect(page.getByRole('alert')).toBeVisible();
    else await expect(page.getByText('Загружаем объявления')).toBeVisible();
    await expect(page.getByRole('button', { name: /Меню пользователя/ })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`listings-${state}.png`, { fullPage: true });
  });
}
