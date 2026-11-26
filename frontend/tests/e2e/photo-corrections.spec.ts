import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { test, expect } from './login-fixture';
import { listingDetails } from '../fixtures/listings';
import { analysis, correctableListing, correctionId, correctedPhotoId, correctionsPath, failed, processing, ready, sourcePhoto } from '../fixtures/photo-corrections';

const id = sourcePhoto.listingId;
const editedImage = new URL('../fixtures/living-room-corrected.jpg', import.meta.url);
const startButton = (page: Page) => page.getByRole('button', { name: 'Исправить с ИИ: Гостиная.jpg' });
const panel = (page: Page) => page.getByRole('region', { name: 'Исправление фото', exact: true });
type Detail = ReturnType<typeof correctableListing>;

async function mockCorrections(page: Page, detail: Detail) {
  const calls: { method: string; path: string; body: Record<string, unknown> | null; version: number }[] = [];
  const attempted = new Set<string>();
  const archive = new Set<string>();
  const problem = (status: number, code: string) => ({ type: 'about:blank', title: 'Не удалось выполнить запрос', status, code, requestId: correctionId });
  await page.route((url) => url.pathname.startsWith(correctionsPath) || url.pathname === sourcePhoto.contentUrl, async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const active = detail.photoCorrection;
    if (method === 'GET') {
      if (active?.status === 'ready' && url.pathname === active.previewUrl) {
        await route.fulfill({ body: await readFile(editedImage), contentType: 'image/jpeg' });
      } else if (archive.has(url.pathname)) {
        await route.fulfill({ body: await readFile(new URL('../../src/pages/home/assets/living-room.jpg', import.meta.url)), contentType: 'image/jpeg' });
      } else await route.fallback();
      return;
    }
    const body = route.request().postDataJSON() as Record<string, unknown> | null;
    const version = Number(body?.expectedVersion ?? url.searchParams.get('expectedVersion'));
    calls.push({ method, path: url.pathname, body, version });
    const sendError = async (status: number, code: string) => route.fulfill({
      status, json: problem(status, code), contentType: 'application/problem+json',
    });
    if (version !== detail.version) return sendError(409, 'VERSION_CONFLICT');
    if (url.pathname === correctionsPath && method === 'POST') {
      if (body?.expectedCorrectionRevision !== detail.photoCorrectionRevision) return sendError(409, 'PHOTO_CORRECTION_CHANGED');
      const key = String(body?.correctionId);
      if (attempted.has(key)) return sendError(409, 'PHOTO_CORRECTION_DUPLICATE');
      if (active && (active.status !== 'failed' || body?.retryCorrectionId !== active.id)) return sendError(409, 'PHOTO_CORRECTION_ACTIVE');
      attempted.add(key);
      detail.photoCorrection = processing(key);
      detail.photoCorrectionRevision++;
      return route.fulfill({ status: 202, json: detail });
    }
    if (!active || !url.pathname.startsWith(`${correctionsPath}/${active.id}`)) return sendError(409, 'PHOTO_CORRECTION_CHANGED');
    if (method === 'POST') {
      if (active.status !== 'ready') return sendError(409, 'PHOTO_CORRECTION_NOT_READY');
      archive.add(sourcePhoto.contentUrl);
      detail.photos = [{
        ...sourcePhoto, id: correctedPhotoId, fileName: 'Гостиная после правки.jpg',
        contentUrl: sourcePhoto.contentUrl.replace(sourcePhoto.id, correctedPhotoId),
        thumbnailUrl: sourcePhoto.thumbnailUrl.replace(sourcePhoto.id, correctedPhotoId),
      }, ...detail.photos.slice(1)];
      detail.version++;
      detail.status = 'draft';
    }
    detail.photoCorrection = null;
    detail.photoCorrectionRevision++;
    return route.fulfill({ status: 200, json: detail });
  });
  return calls;
}

test.beforeEach(async ({ context, loginServer }) => {
  await context.addCookies([{ name: 'session', value: 'test-session', url: `${loginServer.url}/api/v1` }]);
});

test('анализ в двух списках, восстановление, отказ, ошибка, повтор и применение', async ({ page, loginServer }) => {
  const detail = correctableListing();
  const legacy = listingDetails().photos[0]!;
  for (let index = 1; index < 20; index++) {
    const photoId = sourcePhoto.id.slice(0, -2) + String(index).padStart(2, '0');
    detail.photos.push({ ...legacy, id: photoId, fileName: `Архив ${index}.jpg`, quality: 'needs_fix',
      contentUrl: sourcePhoto.contentUrl.replace(sourcePhoto.id, photoId),
      thumbnailUrl: sourcePhoto.thumbnailUrl.replace(sourcePhoto.id, photoId),
    });
  }
  loginServer.controls.detail = detail;
  const calls = await mockCorrections(page, detail);
  await page.goto(`${loginServer.url}/app/listings/${id}`);
  await expect(page.getByRole('heading', { name: 'Фото · 20 из 20' })).toBeVisible();
  const gallery = page.getByRole('list', { name: 'Загруженные фотографии' });
  const recommended = page.getByRole('list', { name: 'Рекомендованные фотографии' });
  await expect(gallery.getByRole('button', { name: /Исправить с ИИ/ })).toHaveCount(1);
  await expect(gallery.getByText('Оценка: среднее').first()).toBeVisible();
  for (const list of [gallery, recommended]) {
    const card = list.getByRole('listitem').filter({ hasText: 'Правка ИИ' });
    await expect(card).toHaveCount(1);
    await expect(card.getByText(analysis.editInstruction)).toBeHidden();
    await card.getByText('Детали анализа', { exact: true }).click();
    await expect(card.getByText(analysis.editInstruction)).toBeVisible();
    await expect(card.getByText(analysis.description)).toBeVisible();
  }

  await startButton(page).click();
  await expect(panel(page).getByText('Исправляем фотографию')).toBeVisible();
  const firstId = detail.photoCorrection!.id;
  expect(calls[0]?.body).toEqual({ improvementType: 'clutter', correctionId: firstId, expectedVersion: 2, expectedCorrectionRevision: 0 });
  await expect(page.getByRole('button', { name: 'Редактировать объявление' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Удалить объявление', exact: true })).toBeDisabled();
  await expect(gallery.getByRole('button', { name: 'Удалить фотографию Гостиная.jpg' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Выбрать площадки' })).toBeDisabled();
  await expect(page.getByText('Результат устарел')).toHaveCount(0);
  await page.reload();
  await expect(panel(page).getByText('Исправляем фотографию')).toBeVisible();
  expect(calls).toHaveLength(1);
  await panel(page).getByRole('button', { name: 'Отменить исправление' }).focus();
  detail.photoCorrection = ready(firstId);
  await expect(panel(page).getByRole('button', { name: 'Применить исправление' })).toBeEnabled();
  await expect(panel(page).getByRole('heading', { name: 'Исправление фото' })).toBeFocused();
  await expect(page.getByRole('status').filter({ hasText: 'Исправленный вариант готов к сравнению.' })).toHaveCount(1);
  await expect(panel(page).getByRole('img', { name: 'Исходное фото' })).toHaveAttribute('src', sourcePhoto.contentUrl);
  await expect(panel(page).getByRole('img', { name: 'Исправленный вариант' })).toHaveAttribute('src', ready(firstId).previewUrl);
  await expect(gallery.getByRole('img', { name: 'Гостиная.jpg' })).toBeVisible();
  await panel(page).getByRole('button', { name: 'Оставить исходное фото' }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(gallery.getByRole('img', { name: 'Гостиная.jpg' })).toBeVisible();
  await expect(page.getByText('Результат устарел')).toHaveCount(0);
  expect(calls[1]).toMatchObject({ method: 'DELETE', path: `${correctionsPath}/${firstId}`, version: 2 });

  await startButton(page).click();
  await expect(panel(page).getByText('Исправляем фотографию')).toBeVisible();
  const secondId = String(calls[2]?.body?.correctionId);
  detail.photoCorrection = failed(secondId);
  await expect(panel(page).getByRole('alert')).toContainText('Обработка заняла слишком много времени');
  await expect(page.getByRole('button', { name: 'Редактировать объявление' })).toBeEnabled();
  await panel(page).getByRole('button', { name: 'Повторить исправление' }).click();
  await expect(panel(page).getByText('Исправляем фотографию')).toBeVisible();
  const thirdId = String(calls[3]?.body?.correctionId);
  expect(thirdId).not.toBe(secondId);
  expect(calls[3]?.body).toMatchObject({ retryCorrectionId: secondId, expectedVersion: 2, expectedCorrectionRevision: 3 });
  detail.photoCorrection = ready(thirdId);
  await panel(page).getByRole('button', { name: 'Применить исправление' }).click();
  await expect(gallery.getByRole('img', { name: 'Гостиная после правки.jpg' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Фото · 20 из 20' })).toBeVisible();
  await expect(page.getByText('Результат устарел')).toBeVisible();
  await expect(page.getByText('Квартира в Санкт-Петербурге.', { exact: true })).toBeVisible();
  expect(calls[4]).toMatchObject({ method: 'POST', path: `${correctionsPath}/${thirdId}/apply`, version: 2 });
  await page.reload();
  await expect(page.getByText('Результат устарел')).toBeVisible();
  expect(detail.version).toBe(3);
  const archived = await page.evaluate(async (url) => (await fetch(url)).status, sourcePhoto.contentUrl);
  expect(archived).toBe(200);
});

test('конфликт в другой вкладке обновляет карточку и не возвращает удалённое фото', async ({ page, loginServer }) => {
  const detail = correctableListing();
  detail.photoCorrection = ready();
  loginServer.controls.detail = detail;
  const calls = await mockCorrections(page, detail);
  await page.goto(`${loginServer.url}/app/listings/${id}`);
  const apply = panel(page).getByRole('button', { name: 'Применить исправление' });
  await expect(apply).toBeEnabled();
  detail.photoCorrection = null;
  detail.photoCorrectionRevision++;
  detail.photos = [];
  detail.version++;
  await apply.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Состояние объявления изменилось');
  await expect(page.getByText('Фотографий пока нет')).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Фото · 0 из 20' })).toBeFocused();
  expect(calls).toHaveLength(1);
});

test('активную правку можно завершить при остановленной очереди загрузки', async ({ page, loginServer }) => {
  const detail = correctableListing();
  loginServer.controls.detail = detail;
  let release!: () => void;
  loginServer.controls.holdUpload = new Promise((resolve) => { release = resolve; });
  await mockCorrections(page, detail);
  const image = await readFile(editedImage);
  const uploads = () => loginServer.calls.filter(({ method, path }) => method === 'POST' && path === `/api/v1/listings/${id}/photos`).length;
  try {
    await page.goto(`${loginServer.url}/app/listings/${id}`);
    await page.getByLabel('Фотографии объявления', { exact: true }).setInputFiles([
      { name: 'Кухня.jpg', mimeType: 'image/jpeg', buffer: image },
      { name: 'Спальня.jpg', mimeType: 'image/jpeg', buffer: image },
    ]);
    await expect.poll(uploads).toBe(1);
    detail.photoCorrection = ready();
    detail.photoCorrectionRevision = 1;
    loginServer.controls.photoError = 409;
    loginServer.controls.photoErrorCode = 'PHOTO_CORRECTION_ACTIVE';
    release();
    await expect(panel(page).getByRole('button', { name: 'Применить исправление' })).toBeEnabled();
    const queue = page.getByRole('list', { name: 'Очередь загрузки' });
    await queue.getByRole('button', { name: 'Убрать из очереди Спальня.jpg' }).click();
    await expect(queue.getByText('Спальня.jpg')).toHaveCount(0);
    await panel(page).getByRole('button', { name: 'Оставить исходное фото' }).click();
    await expect(panel(page)).toHaveCount(0);
    await expect(queue.getByText('Кухня.jpg')).toBeVisible();
    expect(uploads()).toBe(1);
    loginServer.controls.photoError = null;
    await page.getByRole('button', { name: 'Продолжить очередь' }).click();
    await expect.poll(uploads).toBe(2);
  } finally { release(); }
});

test('устаревший запуск отклоняется даже при прежней версии объявления', async ({ page, loginServer }) => {
  const detail = correctableListing();
  loginServer.controls.detail = detail;
  const calls = await mockCorrections(page, detail);
  await page.goto(`${loginServer.url}/app/listings/${id}`);
  await expect(startButton(page)).toBeEnabled();
  detail.photoCorrectionRevision = 2;
  await startButton(page).click();
  await expect(page.getByRole('alert')).toContainText('Состояние объявления изменилось');
  await expect(panel(page)).toHaveCount(0);
  await startButton(page).click();
  await expect(panel(page).getByText('Исправляем фотографию')).toBeVisible();
  expect(calls.map(({ body, version }) => [version, body?.expectedCorrectionRevision])).toEqual([[2, 0], [2, 2]]);
});

test('повтор загрузки предпросмотра сначала сверяет актуальность правки', async ({ page, loginServer }) => {
  const detail = correctableListing();
  const active = ready();
  detail.photoCorrection = active;
  detail.photoCorrectionRevision = 1;
  loginServer.controls.detail = detail;
  let previews = 0;
  await page.route((url) => url.pathname === active.previewUrl, async (route) => {
    previews++;
    await route.fulfill({ status: 404 });
  });
  await page.goto(`${loginServer.url}/app/listings/${id}`);
  const retry = panel(page).getByRole('button', { name: 'Загрузить фото снова' });
  await expect(retry).toBeEnabled();
  detail.photoCorrection = null;
  detail.photoCorrectionRevision = 2;
  await retry.press('Enter');
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Фото · 1 из 20' })).toBeFocused();
  expect(previews).toBe(1);
});

test('ручная сверка после ошибки опроса сохраняет клавиатурный фокус', async ({ page, loginServer }) => {
  const detail = correctableListing();
  detail.photoCorrection = processing();
  detail.photoCorrectionRevision = 1;
  loginServer.controls.detail = detail;
  await mockCorrections(page, detail);
  await page.goto(`${loginServer.url}/app/listings/${id}`);
  await expect(panel(page).getByText('Исправляем фотографию')).toBeVisible();
  loginServer.controls.detailError = 503;
  const retry = page.getByRole('button', { name: 'Проверить исправление' });
  await expect(retry).toBeEnabled();
  loginServer.controls.detailError = null;
  detail.photoCorrection = ready();
  await retry.press('Enter');
  await expect(panel(page).getByRole('button', { name: 'Применить исправление' })).toBeEnabled();
  await expect(retry).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Фото · 1 из 20' })).toBeFocused();
});

test('после восстановления сессии показана ошибка последней сверки', async ({ page, loginServer }) => {
  const detail = correctableListing();
  detail.photoCorrection = ready();
  detail.photoCorrectionRevision = 1;
  loginServer.controls.detail = detail;
  await mockCorrections(page, detail);
  const failures: number[] = [];
  await page.route((url) => url.pathname === `/api/v1/listings/${id}`, (route) => {
    const status = failures.shift();
    return status ? route.fulfill({ status }) : route.fallback();
  });
  await page.goto(`${loginServer.url}/app/listings/${id}`);
  await expect(panel(page).getByRole('button', { name: 'Применить исправление' })).toBeEnabled();
  failures.push(401, 503);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const error = page.getByRole('alert');
  await expect(error).toContainText('Не удалось проверить исправление');
  await expect(error).not.toContainText('Сессия завершилась');
  await error.getByRole('button', { name: 'Повторить' }).click();
  await expect(panel(page).getByRole('button', { name: 'Применить исправление' })).toBeEnabled();
  await expect(error).toHaveCount(0);
});

test('текущий API показывает анализ без запуска исправления', async ({ page, loginServer }) => {
  loginServer.controls.detail = { ...listingDetails(), photos: correctableListing().photos };
  await page.goto(`${loginServer.url}/app/listings/${id}`);
  await expect(page.getByText('Исправление пока недоступно')).toBeVisible();
  await expect(startButton(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Фото · 1 из 20' })).toBeVisible();
  await expect(page.getByText('Результат устарел')).toHaveCount(0);
});

test('ответ 404 от ручки исправления сохраняет фото и результат', async ({ page, loginServer }) => {
  const detail = correctableListing();
  loginServer.controls.detail = detail;
  await page.route((url) => url.pathname === correctionsPath, (route) => route.fulfill({ status: 404, body: 'Not Found' }));
  await page.goto(`${loginServer.url}/app/listings/${id}`);
  await startButton(page).click();
  await expect(page.getByRole('alert')).toContainText('Исправление фотографий пока недоступно');
  await expect(startButton(page)).toBeEnabled();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Фото · 1 из 20' })).toBeVisible();
  await expect(page.getByText('Результат устарел')).toHaveCount(0);
});

for (const width of [390, 1440]) {
  test(`сравнение фото на ширине ${width} px @visual @capture`, async ({ page, loginServer, browserName }, testInfo) => {
    const detail = correctableListing();
    detail.photoCorrection = ready();
    loginServer.controls.detail = detail;
    await mockCorrections(page, detail);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${loginServer.url}/app/listings/${id}`);
    const comparison = panel(page);
    await expect(comparison.getByRole('button', { name: 'Применить исправление' })).toBeEnabled();
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).resolves.toBe(true);
    const capture = async (target: Locator, name: string) => {
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(0, 0);
      if (browserName === 'chromium') await expect(target).toHaveScreenshot(name);
      else {
        const path = testInfo.outputPath(name);
        await target.screenshot({ path, animations: 'disabled', scale: 'css' });
        await testInfo.attach(name, { path, contentType: 'image/png' });
      }
    };
    await capture(comparison, `photo-correction-comparison-${width}.png`);
    if (width === 390) expect((await new AxeBuilder({ page }).include('[aria-labelledby="photo-correction-heading"]').analyze()).violations).toEqual([]);

    if (width === 1440) {
      detail.photoCorrection = null;
      await page.reload();
      const card = page.getByRole('list', { name: 'Загруженные фотографии' }).getByRole('listitem');
      await card.getByText('Детали анализа').click();
      await expect(card.getByText(analysis.editInstruction)).toBeVisible();
      await expect.poll(() => card.getByRole('img').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await capture(card, 'photo-analysis-details.png');

      detail.photoCorrection = processing();
      await page.reload();
      await expect(comparison.getByText('Исправляем фотографию')).toBeVisible();
      await capture(comparison, 'photo-correction-processing.png');
    }
  });
}
