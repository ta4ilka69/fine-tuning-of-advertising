import { test, expect } from './login-fixture';
import { listing, listingDetails } from '../fixtures/listings';

test.describe.configure({ retries: 0 });
for (const width of [1440, 390]) for (const state of ['confirm', 'pending', 'error', 'busy', 'draft'] as const) {
  test(`удаление ${state} ${width} @visual`, async ({ page, context, loginServer }) => {
    await context.addCookies([{ name: 'session', value: 'test-session', url: `${loginServer.url}/api/v1` }]);
    await page.setViewportSize({ width, height: 900 });
    if (state === 'draft') loginServer.controls.detail = listingDetails(listing({ address: null, status: 'draft', hasResult: false }));
    if (state === 'busy') loginServer.controls.detail = { ...listingDetails(), status: 'generating' };
    await page.goto(`${loginServer.url}/app/listings/${listing().id}`);
    await expect(page.getByRole('button', { name: /Меню пользователя/ })).toBeVisible();
    await page.getByRole('button', { name: 'Удалить объявление', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Удалить объявление?' });
    let release: (() => void) | undefined;
    try {
      if (state === 'pending') loginServer.controls.holdListingDelete = new Promise((resolve) => { release = resolve; });
      if (state === 'error') loginServer.controls.deleteListingError = 503;
      if (state === 'error' || state === 'pending') {
        await dialog.getByRole('button', { name: 'Удалить', exact: true }).click();
        if (state === 'error') await expect(dialog.getByRole('alert')).toBeVisible();
        else await expect(dialog.getByText('Удаляем объявление', { exact: true })).toBeVisible();
      }
      await expect(dialog).toBeVisible(); await expect(dialog.getByRole('button', { name: state === 'pending' ? 'Закрыть окно' : 'Отмена', exact: true })).toBeFocused();
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`delete-listing-${state}-${width}.png`);
    } finally { await page.goto('about:blank'); release?.(); }
  });
}
