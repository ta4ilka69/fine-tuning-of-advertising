import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { test, expect } from './login-fixture';
import { listingDetails } from '../fixtures/listings';

const id = listingDetails().id;
const path = `/api/v1/listings/${id}/photos`;
const image = readFileSync(new URL('../../src/pages/home/assets/living-room.jpg', import.meta.url));
const file = (name = 'Гостиная.jpg') => ({ name, mimeType: 'image/jpeg', buffer: image });
const posts = <T extends { path: string; method: string }>(server: { calls: T[] }) => server.calls.filter((call) => call.path === path && call.method === 'POST');
const reads = (server: { calls: { path: string; method: string }[] }) => server.calls.filter((call) => call.path === `/api/v1/listings/${id}` && call.method === 'GET');

test.beforeEach(async ({ context, loginServer }) => { await context.addCookies([{ name: 'session', value: 'test-session', url: `${loginServer.url}/api/v1` }]); });

for (const width of [320, 390, 768, 1440]) test(`фото: доступность и клавиатура ${width}px`, async ({ page, loginServer }) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto(`${loginServer.url}/app/listings/${id}`);
  await expect(page.getByRole('heading', { name: 'Фото · 1 из 20' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'room.jpg', exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Удалить фотографию room.jpg', exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Фото · 0 из 20' })).toBeFocused();
  await expect(page.getByText('Фотографий пока нет')).toBeVisible();
  const deletion = loginServer.calls.find((call) => call.method === 'DELETE')!;
  expect(deletion.query).toBe('?expectedVersion=2'); expect(deletion.cookie).toContain('session=test-session');
});

test('настоящий multipart: смешанный набор, очередь, версии и обработка', async ({ page, loginServer }) => {
  let release!: () => void; loginServer.controls.holdUpload = new Promise((done) => { release = done; });
  await page.goto(`${loginServer.url}/app/listings/${id}`);
  await page.getByLabel('Фотографии объявления', { exact: true }).setInputFiles([file(), { name: 'bad.heic', mimeType: 'image/heic', buffer: Buffer.from('heic') }, file('Кухня.jpg')]);
  await expect(page.getByText('Загружаем файл…')).toBeVisible(); await expect(page.getByText('В очереди', { exact: true })).toBeVisible();
  await expect(page.getByText('Выберите JPEG или PNG.')).toBeVisible(); expect(posts(loginServer)).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Удалить фотографию room.jpg', exact: true })).toBeDisabled();
  release();
  await expect(page.getByText('Обрабатывается на сервере…')).toHaveCount(2); expect(posts(loginServer)).toHaveLength(2);
  expect(posts(loginServer).map((call) => call.body)).toMatchObject([
    { expectedVersion: 2, file: { name: 'Гостиная.jpg', size: image.length, bytes: image.toString('base64') } },
    { expectedVersion: 3, file: { name: 'Кухня.jpg' } },
  ]);
  for (const call of loginServer.calls.filter((entry) => entry.method === 'POST')) {
    expect(call.contentType).toMatch(/^multipart\/form-data; boundary=/); expect(call.cookie).toContain('session=test-session'); expect(call.origin).toBe(loginServer.url);
  }
  loginServer.controls.photoCompletion = 'ready';
  await expect(page.getByText('Обрабатывается на сервере…')).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'Кухня.jpg', exact: true })).toBeVisible();
  const count = reads(loginServer).length; await page.waitForTimeout(1800); expect(reads(loginServer)).toHaveLength(count);
  await page.getByRole('button', { name: 'Удалить фотографию Гостиная.jpg', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Фото · 2 из 20' })).toBeVisible();
  expect(loginServer.calls.filter((call) => call.method === 'DELETE')[0]!.query).toBe('?expectedVersion=4');
});

for (const code of ['VERSION_CONFLICT', 'LISTING_BUSY']) test(`409 ${code}: нет автоматической записи`, async ({ page, loginServer }) => {
  loginServer.controls.photoError = 409; loginServer.controls.photoErrorCode = code;
  await page.goto(`${loginServer.url}/app/listings/${id}`); await page.getByLabel('Фотографии объявления', { exact: true }).setInputFiles([file(), file('second.jpg')]);
  await expect(page.getByRole('button', { name: 'Продолжить очередь' })).toBeVisible(); expect(posts(loginServer)).toHaveLength(1);
  expect(reads(loginServer).length).toBe(2); loginServer.controls.photoError = null;
  await page.getByRole('button', { name: 'Продолжить очередь' }).click();
  await expect(page.getByRole('heading', { name: 'Фото · 3 из 20' })).toBeVisible();
  await expect(page.getByText('Обрабатывается на сервере…')).toHaveCount(2); expect(posts(loginServer)).toHaveLength(3);
});

for (const error of [413, 415, 422, 429, 503, 'network', 'invalid', 'disconnect-after-write'] as const) test(`ошибка фото ${error}: сверка сервера и ручное продолжение`, async ({ page, loginServer }) => {
  loginServer.controls.photoError = error;
  await page.goto(`${loginServer.url}/app/listings/${id}`); await page.getByLabel('Фотографии объявления', { exact: true }).setInputFiles(file());
  await expect(page.getByRole('button', { name: 'Продолжить очередь' })).toBeVisible(); expect(posts(loginServer)).toHaveLength(1); expect(reads(loginServer).length).toBeGreaterThanOrEqual(2);
  const ambiguous = typeof error !== 'number' || error >= 500;
  if (ambiguous) await expect(page.getByText(/Результат неизвестен/)).toBeVisible();
  loginServer.controls.photoError = null; await page.getByRole('button', { name: 'Продолжить очередь' }).click();
  if (ambiguous) { expect(posts(loginServer)).toHaveLength(1); }
  else { await expect(page.getByText('Обрабатывается на сервере…')).toBeVisible(); expect(posts(loginServer)).toHaveLength(2); }
});

for (const status of [401, 403, 404]) test(`доступ фото ${status}`, async ({ page, loginServer }) => {
  loginServer.controls.photoError = status;
  await page.goto(`${loginServer.url}/app/listings/${id}`);
  await expect(page.getByRole('heading', { name: 'Фото · 1 из 20' })).toBeVisible();
  if (status === 401) loginServer.controls.meError = 401;
  await page.getByLabel('Фотографии объявления', { exact: true }).setInputFiles([file(), file('next.jpg')]);
  if (status === 401) { await expect(page.getByRole('heading', { name: 'С возвращением' })).toBeVisible(); }
  else await expect(page.getByRole('alert')).toBeVisible();
  expect(posts(loginServer)).toHaveLength(1);
});

test('processing → failed, ошибка изображения и успешное удаление', async ({ page, loginServer }) => {
  loginServer.controls.photoImageError = true;
  await page.goto(`${loginServer.url}/app/listings/${id}`); await expect(page.getByRole('img', { name: 'Не удалось показать превью room.jpg' })).toBeVisible();
  await page.getByLabel('Фотографии объявления', { exact: true }).setInputFiles(file()); loginServer.controls.photoCompletion = 'failed';
  await expect(page.getByText('Обработка не удалась. Удалите фото и загрузите заново.')).toBeVisible();
  loginServer.controls.photoError = 422; await page.getByRole('button', { name: 'Удалить фотографию Гостиная.jpg', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Продолжить очередь' })).toBeVisible();
  await expect(page.getByText('Обработка не удалась. Удалите фото и загрузите заново.')).toBeVisible();
  loginServer.controls.photoError = null; await page.getByRole('button', { name: 'Продолжить очередь' }).click();
  await page.getByRole('button', { name: 'Удалить фотографию Гостиная.jpg', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Фото · 1 из 20' })).toBeVisible();
});

test('лимит 20 включает обработку и ожидающие файлы', async ({ page, loginServer }) => {
  loginServer.controls.holdUpload = new Promise(() => {});
  await page.goto(`${loginServer.url}/app/listings/${id}`);
  await page.getByLabel('Фотографии объявления', { exact: true }).setInputFiles(Array.from({ length: 21 }, (_, index) => file(`${index}.jpg`)));
  await expect(page.getByRole('heading', { name: 'Фото · 20 из 20' })).toBeVisible(); await expect(page.getByText('Можно добавить не больше 20 фотографий.')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Выбрать фотографии' })).toBeDisabled(); expect(posts(loginServer)).toHaveLength(1);
});

for (const action of ['leave', 'logout'] as const) test(`уход во время загрузки: ${action}`, async ({ page, loginServer }) => {
  let release!: () => void; loginServer.controls.holdUpload = new Promise((done) => { release = done; });
  await page.goto(`${loginServer.url}/app/listings/${id}`); await page.getByLabel('Фотографии объявления', { exact: true }).setInputFiles([file(), file('next.jpg')]);
  await expect(page.getByText('Загружаем файл…')).toBeVisible();
  if (action === 'leave') await page.getByRole('button', { name: '← Мои объявления' }).click();
  else { await page.getByRole('button', { name: /Меню пользователя/ }).click(); await page.getByRole('menuitem', { name: 'Выйти' }).click(); }
  await expect(page.getByRole('heading', { name: action === 'leave' ? 'Мои объявления' : 'С возвращением', exact: true })).toBeVisible();
  release(); await page.waitForTimeout(1600); expect(posts(loginServer)).toHaveLength(1);
});

test('generating блокирует фото, новый черновик не создаётся при открытии', async ({ page, loginServer }) => {
  loginServer.controls.detail = { ...listingDetails(), status: 'generating' };
  await page.goto(`${loginServer.url}/app/listings/${id}`); await expect(page.getByRole('button', { name: 'Выбрать фотографии' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Удалить фотографию room.jpg', exact: true })).toBeDisabled();
  await page.goto(`${loginServer.url}/app/new`); await expect(page.getByRole('button', { name: 'Сохранить черновик', exact: true })).toBeVisible();
  await expect(page.getByLabel('Фотографии объявления', { exact: true })).toHaveCount(0);
  expect(loginServer.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
});

test('превью требует cookie, чужой адрес не попадает в DOM или сеть', async ({ page, loginServer }) => {
  await page.goto(`${loginServer.url}/app/listings/${id}`);
  await expect(page.getByRole('img', { name: 'room.jpg', exact: true })).toBeVisible();
  const thumbnail = loginServer.calls.find((call) => call.path.endsWith('/thumbnail'))!;
  expect(thumbnail.cookie).toContain('session=test-session');
  const result = await page.request.get(`${loginServer.url}${thumbnail.path}`); expect(result.headers()['cache-control']).toBe('private, no-store');
  const otherContext = await page.context().browser()!.newContext(); const denied = await otherContext.request.get(`${loginServer.url}${thumbnail.path}`); expect(denied.status()).toBe(401); await otherContext.close();
  const detail = listingDetails(); detail.photos[0]!.thumbnailUrl = 'https://external.example/private.jpg'; loginServer.controls.detail = detail;
  const external: string[] = []; page.on('request', (request) => { if (request.url().includes('external.example')) external.push(request.url()); });
  await page.reload(); await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByRole('img', { name: 'room.jpg', exact: true })).toHaveCount(0); expect(external).toEqual([]);
});

test('последнее удаление без processing обновляет дату без перезагрузки', async ({ page, loginServer }) => {
  await page.goto(`${loginServer.url}/app/listings/${id}`);
  await expect(page.locator('time').nth(1)).toHaveAttribute('datetime', listingDetails().updatedAt);
  await page.getByRole('button', { name: 'Удалить фотографию room.jpg', exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Фото · 0 из 20' })).toBeFocused();
  await expect(page.locator('time').nth(1)).toHaveAttribute('datetime', '2026-11-06T12:00:00Z');
  expect(reads(loginServer)).toHaveLength(2);
});

test('потерянный ответ выполненного DELETE: обновление и фокус с клавиатуры', async ({ page, loginServer }) => {
  loginServer.controls.photoError = 'disconnect-after-write';
  await page.goto(`${loginServer.url}/app/listings/${id}`);
  await page.getByRole('button', { name: 'Удалить фотографию room.jpg', exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Фото · 0 из 20' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Продолжить очередь' })).toBeVisible();
  expect(loginServer.calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
  expect(reads(loginServer)).toHaveLength(2);
});
