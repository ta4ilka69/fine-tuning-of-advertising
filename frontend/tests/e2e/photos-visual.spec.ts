import { test, expect } from './login-fixture';
import { listingDetails } from '../fixtures/listings';

test.describe.configure({ retries: 0 });
for (const state of ['empty', 'desktop', 'mobile', 'narrow', 'processing', 'failed', 'limit', 'errors'] as const) {
  test(`фотографии ${state} @visual`, async ({ page, context, loginServer }) => {
    await context.addCookies([{ name: 'session', value: 'test-session', url: `${loginServer.url}/api/v1` }]);
    await page.setViewportSize({ width: state === 'mobile' ? 390 : state === 'narrow' ? 320 : 1440, height: 900 });
    const detail = listingDetails();
    if (state === 'processing' || state === 'failed') detail.status = 'draft';
    const count = state === 'empty' || state === 'errors' ? 0 : state === 'limit' ? 20 : 3;
    detail.photos = Array.from({ length: count }, (_, index) => {
      const id = `70792597-4a2a-4ddb-9d00-${String(index + 1).padStart(12, '0')}`;
      const status = state === 'processing' && index > 0 ? 'processing' : state === 'failed' && index === 2 ? 'failed' : 'ready';
      return { ...detail.photos[0]!, id, fileName: ['Гостиная.jpg', 'Кухня.png', 'Спальня.jpg'][index % 3]!, status,
        contentUrl: `/api/v1/listings/${detail.id}/photos/${id}/content`, thumbnailUrl: status === 'ready' ? `/api/v1/listings/${detail.id}/photos/${id}/thumbnail` : null,
        error: status === 'failed' ? { type: 'about:blank', title: 'Ошибка обработки', status: 422, code: 'PHOTO_PROCESSING_FAILED', requestId: id } : null };
    }) as typeof detail.photos;
    loginServer.controls.detail = detail;
    await page.goto(`${loginServer.url}/app/listings/${detail.id}`);
    await expect(page.getByRole('heading', { name: `Фото · ${count} из 20` })).toBeVisible();
    if (state === 'errors') {
      await page.getByLabel('Фотографии объявления', { exact: true }).setInputFiles([
        { name: 'Слишком большой.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(15000001) },
        { name: 'Пустой.png', mimeType: 'image/png', buffer: Buffer.alloc(0) },
        { name: 'Неподдерживаемый.heic', mimeType: 'image/heic', buffer: Buffer.from('heic') },
      ]);
      await expect(page.getByText('Файл пустой.')).toBeVisible();
    }
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('button', { name: /Меню пользователя/ })).toBeVisible();
    await expect(page).toHaveScreenshot(`photos-${state}.png`, { fullPage: true });
  });
}
