import { test, expect } from './login-fixture';
import { listingDetails, listing } from '../fixtures/listings';

test.describe.configure({ retries: 0 });
for (const state of ['desktop', 'mobile', 'tablet', 'narrow', 'error', 'conflict', 'locked', 'confirm', 'copy'] as const) {
  test(`редактирование ${state} @visual`, async ({ page, context, loginServer }) => {
    await context.addCookies([{ name: 'session', value: 'test-session', url: `${loginServer.url}/api/v1` }]);
    await page.setViewportSize({ width: state === 'mobile' ? 390 : state === 'tablet' ? 768 : state === 'narrow' ? 320 : 1440, height: 900 });
    const detail = { ...listingDetails(), data: { deal: { type: 'sale', price: 9800000, mortgageAllowed: true }, object: { type: 'flat', roomsCount: 2, totalArea: 54, livingArea: 30, kitchenArea: 10, floor: 7 }, building: { floorsCount: 12 }, location: { address: 'Санкт-Петербург, Лесной проспект, 10', undergrounds: [{ name: 'Лесная', minutes: 7, transportType: 'walk' }] }, extra: 'Окна во двор. Мебель и техника остаются.' } };
    loginServer.controls.detail = detail;
    await page.goto(`${loginServer.url}/app/listings/${listing().id}`);
    await page.getByRole('button', { name: 'Редактировать объявление', exact: true }).click();
    await expect(page.getByRole('form', { name: 'Редактирование объявления' })).toBeVisible();
    if (['error', 'conflict', 'locked', 'confirm', 'copy'].includes(state)) {
      loginServer.controls.updateError = state === 'error' ? 503 : 409;
      loginServer.controls.updateErrorCode = state === 'locked' ? 'LISTING_BUSY' : 'VERSION_CONFLICT';
      await page.getByLabel('Адрес', { exact: true }).fill('Санкт-Петербург, Лесной проспект, 12');
      await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
      if (state === 'error') await expect(page.getByRole('alert')).toBeVisible();
      else await expect(page.getByRole('button', { name: 'Сохранить изменения', exact: true })).toBeDisabled();
      if (state === 'confirm') await page.getByRole('button', { name: 'Загрузить актуальные данные' }).click();
      if (state === 'copy') await page.getByRole('button', { name: 'Посмотреть мои правки' }).click();
    }
    await page.evaluate(() => document.fonts.ready); await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot(`edit-listing-${state}.png`, { fullPage: state !== 'confirm' && state !== 'copy' });
  });
}
