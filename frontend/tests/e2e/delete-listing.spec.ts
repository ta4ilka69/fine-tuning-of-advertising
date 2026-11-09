import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './login-fixture';
import { listing, listingDetails, listingItems } from '../fixtures/listings';
import type { Page } from '@playwright/test';

const id = listing().id;
const trigger = (page: Page) => page.getByRole('button', { name: 'Удалить объявление', exact: true });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Удалить объявление?' });
const confirm = (page: Page) => dialog(page).getByRole('button', { name: 'Удалить', exact: true });
const writes = (server: { calls: { method: string; path: string }[] }) => server.calls.filter((call) => call.method === 'DELETE' && call.path.endsWith(id));
const open = async (page: Page, url: string) => {
  await page.goto(`${url}/app/listings/${id}`); await trigger(page).click(); await expect(dialog(page)).toBeVisible();
};
test.beforeEach(async ({ context, loginServer }) => {
  await context.addCookies([{ name: 'session', value: 'test-session', url: `${loginServer.url}/api/v1` }]);
  loginServer.controls.listingDataset = structuredClone(listingItems);
});

for (const width of [320, 390, 768, 1440]) test(`клавиатура, фокус, отмена и доступность ${width}`, async ({ page, loginServer }) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto(`${loginServer.url}/app/listings/${id}`);
  await trigger(page).focus(); await page.keyboard.press('Enter');
  const cancel = dialog(page).getByRole('button', { name: 'Отмена', exact: true }); await expect(cancel).toBeFocused();
  await expect(dialog(page)).toContainText(listing().address!); await expect(dialog(page)).toContainText('связанные фотографии и результаты');
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); await expect(dialog(page).locator(':focus')).toHaveCount(1); }
  await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0); await expect(trigger(page)).toBeFocused();
  await trigger(page).click(); await dialog(page).getByRole('button', { name: 'Отмена', exact: true }).click(); await expect(trigger(page)).toBeFocused();
  expect(writes(loginServer)).toHaveLength(0); await trigger(page).click();
  await expect(cancel).toBeFocused(); await expect(dialog(page)).toHaveCSS('opacity', '1');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('204, двойное подтверждение, блокировка фото и свежий список', async ({ page, loginServer }) => {
  await open(page, loginServer.url); let release!: () => void; loginServer.controls.holdListingDelete = new Promise((resolve) => { release = resolve; });
  try {
    await confirm(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect(page.getByText('Удаляем объявление', { exact: true })).toBeVisible(); expect(writes(loginServer)).toHaveLength(1);
    expect(loginServer.calls.find((call) => call.method === 'DELETE')).toMatchObject({ path: `/api/v1/listings/${id}`, query: '?expectedVersion=2', body: null });
    await expect(confirm(page)).toBeDisabled(); await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Редактировать объявление', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Выбрать фотографии' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Удалить фотографию room.jpg' })).toBeDisabled();
    release(); await expect(page).toHaveURL(`${loginServer.url}/app`);
    await expect(page.getByRole('link', { name: listingItems[2]!.address!, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: listing().address!, exact: true })).toHaveCount(0); expect(writes(loginServer)).toHaveLength(1);
  } finally { release(); }
});

for (const error of [403, 404, 422, 503, 'invalid'] as const) test(`ошибка ${error} и ручное восстановление`, async ({ page, loginServer }) => {
  await open(page, loginServer.url); loginServer.controls.deleteListingError = error; await confirm(page).click();
  await expect(dialog(page).getByRole('alert')).toBeVisible(); expect(writes(loginServer)).toHaveLength(1);
  await expect(page.getByRole('heading', { name: listing().address!, exact: true, includeHidden: true })).toHaveCount(1);
  if (error === 404) { await dialog(page).getByRole('button', { name: 'К списку объявлений' }).click(); await expect(page).toHaveURL(`${loginServer.url}/app`); }
  else if (error === 403) { await expect(confirm(page)).toHaveCount(0); }
  else {
    loginServer.controls.deleteListingError = null;
    if (error !== 422) {
      await expect(confirm(page)).toHaveCount(0); await dialog(page).getByRole('button', { name: 'Проверить состояние' }).click();
      if (error === 'invalid') { await expect(page).toHaveURL(`${loginServer.url}/app`); expect(writes(loginServer)).toHaveLength(1); return; }
      await expect(confirm(page)).toBeEnabled(); expect(writes(loginServer)).toHaveLength(1);
    }
    await confirm(page).click(); await expect(page).toHaveURL(`${loginServer.url}/app`); expect(writes(loginServer)).toHaveLength(2);
  }
});

test('конфликт: явная загрузка версии и повторное подтверждение нового адреса', async ({ page, loginServer }) => {
  await open(page, loginServer.url); loginServer.controls.detail = { ...listingDetails(), version: 7, data: { location: { address: 'Новый адрес' } } };
  await confirm(page).click(); await expect(dialog(page).getByText('Объявление изменилось', { exact: true })).toBeVisible();
  await expect(confirm(page)).toHaveCount(0); await dialog(page).getByRole('button', { name: 'Загрузить актуальную карточку' }).click();
  await expect(dialog(page)).toContainText('Новый адрес'); await expect(confirm(page)).toBeEnabled(); expect(writes(loginServer)).toHaveLength(1);
  await confirm(page).click(); await expect(page).toHaveURL(`${loginServer.url}/app`);
  expect(loginServer.calls.filter((call) => call.method === 'DELETE').map((call) => call.query)).toEqual(['?expectedVersion=2', '?expectedVersion=7']);
});

for (const known of [false, true]) test(`генерация ${known ? 'из GET' : 'LISTING_BUSY'}`, async ({ page, loginServer }) => {
  if (known) loginServer.controls.detail = { ...listingDetails(), status: 'generating' };
  await open(page, loginServer.url);
  if (!known) { loginServer.controls.deleteListingError = 409; loginServer.controls.deleteListingErrorCode = 'LISTING_BUSY'; await confirm(page).click(); }
  await expect(confirm(page)).toHaveCount(0); await expect(dialog(page)).toContainText('Восстановить их не получится');
  loginServer.controls.detail = listingDetails(); loginServer.controls.deleteListingError = null;
  await dialog(page).getByRole('button', { name: 'Проверить состояние' }).click(); await expect(confirm(page)).toBeEnabled();
  expect(writes(loginServer)).toHaveLength(known ? 0 : 1); await confirm(page).click(); await expect(page).toHaveURL(`${loginServer.url}/app`);
});

test('потерянный ответ после удаления: сверка GET404 без второго DELETE', async ({ page, loginServer }) => {
  await open(page, loginServer.url);
  await page.route(`**/api/v1/listings/${id}?expectedVersion=*`, async (route) => { await route.fetch({ maxRetries: 0 }); await route.abort('failed'); });
  await confirm(page).click();
  await expect(dialog(page).getByRole('alert')).toBeVisible(); expect(loginServer.controls.deletedListings.has(id)).toBe(true);
  await dialog(page).getByRole('button', { name: 'Проверить состояние' }).click(); await expect(page).toHaveURL(`${loginServer.url}/app`);
  await expect(page.getByRole('link', { name: listing().address!, exact: true })).toHaveCount(0); expect(writes(loginServer)).toHaveLength(1);
});

test('версия после удаления фото и сохранения; в редакторе удаление скрыто', async ({ page, loginServer }) => {
  await page.goto(`${loginServer.url}/app/listings/${id}`);
  await page.getByRole('button', { name: 'Удалить фотографию room.jpg' }).click();
  await expect(page.getByRole('heading', { name: 'Фото · 0 из 20' })).toBeVisible();
  await expect(trigger(page)).toBeEnabled(); await page.getByRole('button', { name: 'Редактировать объявление', exact: true }).click();
  await expect(trigger(page)).toHaveCount(0); await page.getByLabel('Адрес', { exact: true }).fill('Сохранённый адрес');
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click(); await expect(page.getByText('Изменения сохранены', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Отменить редактирование' }).click(); await trigger(page).click(); await expect(dialog(page)).toContainText('Сохранённый адрес');
  await confirm(page).click(); await expect(page).toHaveURL(`${loginServer.url}/app`); expect(loginServer.calls.filter((call) => call.method === 'DELETE' && call.path.endsWith(id))[0]!.query).toBe('?expectedVersion=4');
});

test('загрузка фото блокирует удаление до подтверждённого GET', async ({ page, loginServer }) => {
  await page.goto(`${loginServer.url}/app/listings/${id}`); await expect(trigger(page)).toBeEnabled();
  let release!: () => void; loginServer.controls.holdUpload = new Promise((resolve) => { release = resolve; });
  try {
    await page.getByLabel('Фотографии объявления', { exact: true }).setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('jpeg') });
    await expect(trigger(page)).toBeDisabled(); release(); await expect(trigger(page)).toBeEnabled();
    await trigger(page).click(); await confirm(page).click(); await expect(page).toHaveURL(`${loginServer.url}/app`);
    expect(loginServer.calls.filter((call) => call.method === 'DELETE' && call.path.endsWith(id))[0]!.query).toBe('?expectedVersion=3');
  } finally { release(); }
});

for (const action of ['navigate', 'logout', 'user', 'session-error'] as const) test(`уход/смена сессии ${action}: поздний DELETE не меняет экран`, async ({ page, loginServer }) => {
  await open(page, loginServer.url); let release!: () => void; loginServer.controls.holdListingDelete = new Promise((resolve) => { release = resolve; });
  try {
    await confirm(page).click(); await expect(page.getByText('Удаляем объявление', { exact: true })).toBeVisible(); await page.keyboard.press('Escape');
    if (action === 'navigate') { await page.getByRole('button', { name: '← Мои объявления', exact: true }).click(); await page.getByRole('button', { name: 'Создать объявление', exact: true }).click(); }
    else if (action === 'logout') { await page.getByRole('button', { name: /Меню пользователя/ }).click(); await page.getByRole('menuitem', { name: 'Выйти', exact: true }).click(); }
    else {
      if (action === 'user') loginServer.controls.userId = '9a07b31d-ac15-495c-bb91-e3756fe40bcd'; else loginServer.controls.meError = 503;
      await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
      if (action === 'user') await expect(trigger(page)).toBeEnabled(); else await expect(page.getByText('Не удалось проверить сессию', { exact: true })).toBeVisible();
    }
    release();
    if (action === 'navigate') await expect(page.getByRole('heading', { name: 'Новое объявление', exact: true })).toBeVisible();
    else if (action === 'logout') await expect(page.getByRole('heading', { name: 'С возвращением', exact: true })).toBeVisible();
    else if (action === 'user') { await expect(page.getByRole('heading', { name: 'Объявление', exact: true })).toBeVisible(); await expect(dialog(page)).toHaveCount(0); }
    else {
      loginServer.controls.meError = null; await page.getByRole('button', { name: 'Повторить', exact: true }).click(); await trigger(page).click();
      await expect(dialog(page).getByRole('button', { name: 'Проверить состояние' })).toBeEnabled(); await expect(confirm(page)).toHaveCount(0);
      await dialog(page).getByRole('button', { name: 'Проверить состояние' }).click(); await expect(page).toHaveURL(`${loginServer.url}/app`);
    }
    expect(writes(loginServer)).toHaveLength(1);
  } finally { release(); }
});

test('401 использует существующее восстановление сессии', async ({ page, loginServer }) => {
  await open(page, loginServer.url); loginServer.controls.deleteListingError = 401; loginServer.controls.meError = 401;
  await confirm(page).click(); await expect(page.getByRole('heading', { name: 'С возвращением', exact: true })).toBeVisible();
  expect(writes(loginServer)).toHaveLength(1); expect(loginServer.calls.filter((call) => call.path.endsWith('/me'))).toHaveLength(2);
});


test('обрыв сети: один DELETE и ручная сверка перед новым подтверждением', async ({ page, loginServer }) => {
  await open(page, loginServer.url); let requests = 0;
  page.on('request', (request) => { if (request.method() === 'DELETE') requests++; });
  await page.route(`**/api/v1/listings/${id}?expectedVersion=*`, (route) => route.abort('failed'));
  await confirm(page).click(); await expect(dialog(page).getByRole('alert')).toBeVisible(); expect(requests).toBe(1);
  await dialog(page).getByRole('button', { name: 'Проверить состояние' }).click(); await expect(confirm(page)).toBeEnabled(); expect(requests).toBe(1);
  await page.unroute(`**/api/v1/listings/${id}?expectedVersion=*`); await confirm(page).click(); await expect(page).toHaveURL(`${loginServer.url}/app`);
  expect(requests).toBe(2); expect(writes(loginServer)).toHaveLength(1);
});

test('повторный GET401 снова проверяет ту же сессию без повторного DELETE', async ({ page, loginServer }) => {
  await open(page, loginServer.url); loginServer.controls.deleteListingError = 401; await confirm(page).click();
  await expect.poll(() => loginServer.calls.filter((call) => call.path.endsWith('/me')).length).toBe(2);
  await expect(dialog(page).getByRole('button', { name: 'Проверить состояние' })).toBeEnabled();
  loginServer.controls.detailError = 401; loginServer.controls.meError = 401;
  await dialog(page).getByRole('button', { name: 'Проверить состояние' }).click();
  await expect(page.getByRole('heading', { name: 'С возвращением', exact: true })).toBeVisible();
  expect(loginServer.calls.filter((call) => call.path.endsWith('/me'))).toHaveLength(3); expect(writes(loginServer)).toHaveLength(1);
});

test('уход отменяет сверку GET; её запоздалый 404 не меняет новый экран', async ({ page, loginServer }) => {
  await open(page, loginServer.url); loginServer.controls.deleteListingError = 503; await confirm(page).click();
  await expect(dialog(page).getByRole('alert')).toBeVisible(); let release!: () => void;
  loginServer.controls.holdDetail = new Promise((resolve) => { release = resolve; }); loginServer.controls.detailError = 404;
  try {
    await dialog(page).getByRole('button', { name: 'Проверить состояние' }).click();
    await expect(page.getByText('Проверяем состояние объявления', { exact: true })).toBeVisible(); await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '← Мои объявления', exact: true }).click(); await page.getByRole('button', { name: 'Создать объявление', exact: true }).click();
    release(); await expect(page.getByRole('heading', { name: 'Новое объявление', exact: true })).toBeVisible(); expect(writes(loginServer)).toHaveLength(1);
  } finally { release(); }
});
