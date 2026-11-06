import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './login-fixture';
import { listingDetails, listing } from '../fixtures/listings';
import type { ListingData } from '../../src/shared/api/listing-data';

const id = listing().id;
const writes = (server: { calls: { method: string; body: unknown }[] }) => server.calls.filter((call) => call.method === 'PUT');
test.beforeEach(async ({ context, loginServer }) => {
  loginServer.controls.listingPages = [{ items: [listing()], nextCursor: null }];
  await context.addCookies([{ name: 'session', value: 'test-session', url: `${loginServer.url}/api/v1` }]);
});
const open = async (page: import('@playwright/test').Page, url: string) => {
  await page.goto(`${url}/app`); await page.getByRole('link', { name: listing().address!, exact: true }).click(); await page.getByRole('button', { name: 'Редактировать объявление', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Редактирование объявления' })).toBeVisible();
};
const save = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'Сохранить изменения', exact: true });

for (const deal of ['sale', 'rent', 'daily_rent'] as const) for (const object of ['flat', 'room', 'house', 'apartments'] as const) {
  test(`полное заполнение, неизменённое сохранение и правка ${deal}/${object}`, async ({ page, loginServer }) => {
    const data: ListingData = { deal: { type: deal, price: 65000, ...(deal === 'sale' ? { mortgageAllowed: false } : { deposit: 0 }) }, object: { type: object === 'apartments' ? 'flat' : object, totalArea: 54, ...(['flat', 'apartments'].includes(object) ? { isApartments: object === 'apartments', roomsCount: 0 } : {}) }, location: { address: 'Лесная', undergrounds: [] }, ...(object === 'house' ? { house: { materialTypes: [] } } : { building: {} }), extra: 'Сохранённый комментарий' };
    const detail = { ...listingDetails(), data };
    loginServer.controls.detail = detail;
    await open(page, loginServer.url);
    await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('Лесная');
    await save(page).click(); await expect(page.getByText('Изменения сохранены', { exact: true })).toBeVisible();
    expect(writes(loginServer)[0]!.body).toEqual({ data, expectedVersion: 2 });
    expect(loginServer.controls.details.get(id)).toMatchObject({ version: 2, status: 'ready', updatedAt: detail.updatedAt, result: detail.result });
    await page.getByLabel('Адрес', { exact: true }).fill('Новый адрес'); await page.getByLabel('Комментарий об объекте', { exact: true }).fill('');
    await save(page).click(); await expect(page.getByRole('heading', { name: 'Новый адрес', exact: true })).toBeVisible();
    expect(writes(loginServer)[1]!.body).toEqual({ data: { ...data, extra: undefined, location: { ...data.location, address: 'Новый адрес' } }, expectedVersion: 2 });
    expect(loginServer.controls.details.get(id)).toMatchObject({ version: 3, status: 'draft', result: detail.result });
    await page.getByLabel('Адрес', { exact: true }).fill('Третья правка'); await save(page).click();
    await expect(page.getByText('Изменения сохранены', { exact: true })).toBeVisible(); expect(writes(loginServer)[2]!.body).toMatchObject({ expectedVersion: 3 });
    let prompts = 0; page.on('dialog', (dialog) => { prompts++; void dialog.dismiss(); });
    await page.getByRole('button', { name: 'Отменить редактирование' }).click();
    await expect(page.getByRole('button', { name: 'Редактировать объявление', exact: true })).toBeVisible(); expect(prompts).toBe(0);
  });
}

test('неполный черновик и скрытые значения сохраняются без потерь', async ({ page, loginServer }) => {
  const data: ListingData = { deal: { deposit: 0 }, object: { roomsCount: 0, isApartments: false }, house: { materialTypes: [] }, rules: { petsAllowed: false }, amenities: {}, building: {}, location: { undergrounds: [] } };
  loginServer.controls.detail = { ...listingDetails(listing({ status: 'draft' })), data };
  await open(page, loginServer.url); await save(page).click(); await expect(page.getByText('Изменения сохранены', { exact: true })).toBeVisible();
  expect(writes(loginServer)[0]!.body).toEqual({ data, expectedVersion: 2 });
});

test('конфликт оставляет ввод, запрещает повтор и требует подтверждения замены', async ({ page, loginServer }) => {
  await open(page, loginServer.url); await page.getByLabel('Адрес', { exact: true }).fill('Мой локальный адрес');
  loginServer.controls.detail = { ...listingDetails(), version: 3, data: { location: { address: 'Чужая правка' } } };
  await save(page).click(); await expect(page.getByText('Объявление изменилось в другом окне', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('Мой локальный адрес'); await expect(save(page)).toBeDisabled(); expect(writes(loginServer)).toHaveLength(1);
  await page.getByRole('button', { name: 'Загрузить актуальные данные' }).click();
  await expect(page.getByRole('dialog', { name: 'Загрузить актуальные данные?' })).toBeVisible();
  await page.getByRole('button', { name: 'Вернуться к форме', exact: true }).click();
  await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('Мой локальный адрес');
  await page.getByRole('button', { name: 'Посмотреть мои правки' }).click(); await expect(page.getByLabel('Сохранённый ввод')).toContainText('Мой локальный адрес');
  await page.getByRole('button', { name: 'Вернуться к форме', exact: true }).click();
  await page.getByRole('button', { name: 'Загрузить актуальные данные' }).click(); await page.getByRole('button', { name: 'Загрузить и заменить форму' }).click();
  await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('Чужая правка'); expect(writes(loginServer)).toHaveLength(1);
  await page.getByRole('button', { name: 'Открыть сохранённые правки' }).click(); await expect(page.getByLabel('Сохранённый ввод')).toContainText('Мой локальный адрес');
  await page.getByRole('button', { name: 'Вернуться к форме', exact: true }).click();
  await save(page).click(); await expect(page.getByText('Изменения сохранены', { exact: true })).toBeVisible(); expect(writes(loginServer)[1]!.body).toMatchObject({ expectedVersion: 3 });
});

test('генерация, начавшаяся в другом окне: ручная сверка без потери ввода', async ({ page, loginServer }) => {
  await open(page, loginServer.url); await page.getByLabel('Адрес', { exact: true }).fill('Мои правки');
  loginServer.controls.detail = { ...listingDetails(), status: 'generating' };
  await save(page).click(); await expect(save(page)).toBeDisabled(); await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('Мои правки');
  loginServer.controls.detail = listingDetails();
  await page.getByRole('button', { name: 'Проверить состояние', exact: true }).click(); await expect(save(page)).toBeEnabled();
  await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('Мои правки'); expect(writes(loginServer)).toHaveLength(1);
  await save(page).click(); await expect(page.getByText('Изменения сохранены', { exact: true })).toBeVisible(); expect(writes(loginServer)).toHaveLength(2);
});

test('генерация изначально закрывает доступ к изменению', async ({ page, loginServer }) => {
  loginServer.controls.detail = listingDetails(listing({ status: 'generating' }));
  await page.goto(`${loginServer.url}/app/listings/${id}`); await expect(page.getByRole('button', { name: 'Редактировать объявление', exact: true })).toBeDisabled();
  expect(writes(loginServer)).toHaveLength(0);
});

for (const failure of [422, 503, 'network', 'invalid', 'broken-json'] as const) {
  test(`ошибка PUT ${failure} сохраняет ввод и позволяет только ручной повтор`, async ({ page, loginServer }) => {
    loginServer.controls.updateError = failure; loginServer.controls.updateFields = ['/data/building/buildYear'];
    await open(page, loginServer.url); await page.getByLabel('Адрес', { exact: true }).fill('Не терять');
    await save(page).click(); await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('Не терять');
    expect(writes(loginServer)).toHaveLength(1); await expect(page.getByRole('alert')).not.toContainText('Technical');
    if (failure === 422) await expect(page.getByLabel('Год постройки здания', { exact: true })).toBeFocused();
    loginServer.controls.updateError = null;
    if (failure === 'invalid') {
      await save(page).click(); await expect(page.getByText('Объявление изменилось в другом окне', { exact: true })).toBeVisible();
    } else { await save(page).click(); await expect(page.getByText('Изменения сохранены', { exact: true })).toBeVisible(); }
    expect(writes(loginServer)).toHaveLength(2);
  });
}

for (const status of [403, 404] as const) test(`PUT ${status} не уничтожает ввод и блокирует дальнейшую запись`, async ({ page, loginServer }) => {
  await open(page, loginServer.url); await page.getByLabel('Адрес', { exact: true }).fill('Мои правки'); loginServer.controls.updateError = status;
  await save(page).click(); await expect(page.getByRole('alert')).toBeVisible(); await expect(save(page)).toBeDisabled(); await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('Мои правки'); expect(writes(loginServer)).toHaveLength(1);
});

for (const status of [403, 404, 503] as const) test(`загрузка карточки ${status} и ручной повтор`, async ({ page, loginServer }) => {
  loginServer.controls.detailError = status; await page.goto(`${loginServer.url}/app/listings/${id}`); await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Редактировать объявление', exact: true })).toHaveCount(0);
  loginServer.controls.detailError = null; await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Редактировать объявление', exact: true })).toBeEnabled();
});

for (const width of [320, 390, 768, 1440]) test(`клавиатура, доступность и ширина ${width}`, async ({ page, loginServer }) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto(`${loginServer.url}/app/listings/${id}`);
  const edit = page.getByRole('button', { name: 'Редактировать объявление', exact: true }); await edit.focus(); await edit.press('Enter');
  await expect(page.getByLabel('Адрес', { exact: true })).toBeVisible();
  await page.getByLabel('Адрес', { exact: true }).focus(); await page.getByLabel('Адрес', { exact: true }).press('Tab');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('401, временная ошибка проверки и смена пользователя', async ({ page, loginServer }) => {
  await open(page, loginServer.url); await page.getByLabel('Адрес', { exact: true }).fill('Ввод первого пользователя');
  loginServer.controls.updateError = 401; loginServer.controls.meError = 503;
  await save(page).click(); await expect(page.getByText('Не удалось проверить сессию', { exact: true })).toBeVisible();
  let dialogs = 0; page.on('dialog', (dialog) => { dialogs++; void dialog.dismiss(); });
  await page.goBack(); await expect.poll(() => dialogs).toBe(1);
  loginServer.controls.meError = null; await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('Ввод первого пользователя');
  loginServer.controls.userId = '9a07b31d-ac15-495c-bb91-e3756fe40bcd';
  loginServer.controls.detail = { ...listingDetails(), data: { location: { address: 'Объект другого пользователя' } } };
  await save(page).click(); await expect(page.getByRole('form', { name: 'Редактирование объявления' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Редактировать объявление', exact: true }).click();
  await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('Объект другого пользователя');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test('401 при длительной перепроверке не снимает защиту ввода; истёкшая сессия закрывает форму', async ({ page, loginServer }) => {
  await open(page, loginServer.url); await page.getByLabel('Адрес', { exact: true }).fill('Мои изменения');
  let release!: () => void; loginServer.controls.holdMe = new Promise((resolve) => { release = resolve; }); loginServer.controls.updateError = 401;
  await save(page).click(); await expect(page.getByText('Проверяем сессию', { exact: true })).toBeVisible();
  let prompts = 0; page.on('dialog', (dialog) => { prompts++; void dialog.dismiss(); });
  await page.goBack(); await expect.poll(() => prompts).toBe(1);
  release(); await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('Мои изменения');
  loginServer.controls.meError = 401; await save(page).click();
  await expect(page.getByRole('heading', { name: 'С возвращением' })).toBeVisible(); expect(writes(loginServer)).toHaveLength(2);
});

test('фото меняют версию до редактирования; форма блокирует загрузку и удаление', async ({ page, loginServer }) => {
  await page.goto(`${loginServer.url}/app/listings/${id}`);
  await page.getByLabel('Фотографии объявления', { exact: true }).setInputFiles({ name: 'new.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('jpeg') });
  await expect(page.getByRole('heading', { name: 'Фото · 2 из 20' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Редактировать объявление', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Редактировать объявление', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Выбрать фотографии' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Удалить фотографию room.jpg' })).toBeDisabled();
  await save(page).click(); await expect(page.getByText('Изменения сохранены', { exact: true })).toBeVisible();
  expect(writes(loginServer)[0]!.body).toMatchObject({ expectedVersion: 3 });
  await page.getByRole('button', { name: 'Отменить редактирование' }).click();
  await expect(page.getByRole('button', { name: 'Выбрать фотографии' })).toBeEnabled();
  await page.getByRole('button', { name: 'Удалить фотографию room.jpg' }).click();
  await expect(page.getByRole('heading', { name: 'Фото · 1 из 20' })).toBeVisible();
});

test('запоздалый GET не откатывает PUT, фоновая проверка не заменяет ввод', async ({ page, loginServer }) => {
  const detail = listingDetails(); Object.assign(detail.photos[0]!, { status: 'processing', thumbnailUrl: null }); loginServer.controls.detail = detail;
  await open(page, loginServer.url); await page.getByLabel('Адрес', { exact: true }).fill('Новый адрес после GET');
  let release!: () => void; loginServer.controls.holdDetail = new Promise((resolve) => { release = resolve; });
  const count = loginServer.calls.filter((call) => call.method === 'GET' && call.path.endsWith(id)).length;
  await expect.poll(() => loginServer.calls.filter((call) => call.method === 'GET' && call.path.endsWith(id)).length).toBeGreaterThan(count);
  await save(page).click(); await expect(page.getByText('Изменения сохранены', { exact: true })).toBeVisible();
  release(); loginServer.controls.holdDetail = undefined;
  await expect(page.getByRole('heading', { name: 'Новый адрес после GET', exact: true })).toBeVisible();
  await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('Новый адрес после GET');
  expect(writes(loginServer)[0]!.body).toMatchObject({ expectedVersion: 2 });
});

test('фоновый GET новой версии не подставляет её в изменённую форму', async ({ page, loginServer }) => {
  const detail = listingDetails(); Object.assign(detail.photos[0]!, { status: 'processing', thumbnailUrl: null }); loginServer.controls.detail = detail;
  await open(page, loginServer.url); await page.getByLabel('Адрес', { exact: true }).fill('Локальные данные');
  loginServer.controls.detail = { ...detail, version: 3, data: { location: { address: 'Другое окно' } } };
  await expect(page.getByText('Объявление изменилось в другом окне', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('Локальные данные'); await expect(save(page)).toBeDisabled(); expect(writes(loginServer)).toHaveLength(0);
});

test('повторное сохранение, выход, отмена, Back/Forward и перезагрузка', async ({ page, loginServer }) => {
  await page.goto(`${loginServer.url}/app`); await page.getByRole('link', { name: listing().address!, exact: true }).click();
  await page.getByRole('button', { name: 'Редактировать объявление', exact: true }).click(); await page.getByLabel('Адрес', { exact: true }).fill('Несохранённый ввод');
  let prompts = 0; page.on('dialog', (dialog) => { prompts++; void dialog.dismiss(); });
  await page.getByRole('button', { name: 'Отменить редактирование' }).click(); await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('Несохранённый ввод');
  await page.goBack(); await expect.poll(() => prompts).toBe(2); await expect(page).toHaveURL(`${loginServer.url}/app/listings/${id}`);
  await page.getByRole('button', { name: /Меню пользователя/ }).click(); await page.getByRole('menuitem', { name: 'Выйти' }).click(); await expect.poll(() => prompts).toBe(3);
  expect(loginServer.calls.filter((call) => call.path.endsWith('/logout'))).toHaveLength(0);
  let release!: () => void; loginServer.controls.holdUpdate = new Promise((resolve) => { release = resolve; });
  await page.getByRole('form', { name: 'Редактирование объявления' }).evaluate((form: HTMLFormElement) => { form.requestSubmit(); form.requestSubmit(); });
  await expect(page.getByText('Сохраняем объявление', { exact: true })).toBeVisible(); expect(writes(loginServer)).toHaveLength(1);
  await expect(page.getByLabel('Адрес', { exact: true })).toBeDisabled();
  page.removeAllListeners('dialog'); page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Отменить редактирование' }).click(); release();
  await expect(page.getByRole('form', { name: 'Редактирование объявления' })).toHaveCount(0);
  await page.reload(); await page.getByRole('button', { name: 'Редактировать объявление', exact: true }).click();
  await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('Несохранённый ввод');
  await page.getByLabel('Адрес', { exact: true }).fill('Другой ввод'); await page.reload();
  await page.getByRole('button', { name: 'Редактировать объявление', exact: true }).click(); await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('Несохранённый ввод');
});

test('устаревшая версия конфликтует и при неизменённом data', async ({ page, loginServer }) => {
  await open(page, loginServer.url); loginServer.controls.detail = { ...listingDetails(), version: 3 };
  await save(page).click(); await expect(page.getByText('Объявление изменилось в другом окне', { exact: true })).toBeVisible();
  expect(writes(loginServer)[0]!.body).toEqual({ data: listingDetails().data, expectedVersion: 2 });
  await expect(save(page)).toBeDisabled(); expect(writes(loginServer)).toHaveLength(1);
});

test('предупреждения о противоречиях не блокируют сохранение правок', async ({ page, loginServer }) => {
  await open(page, loginServer.url); await page.getByLabel('Общая площадь, м²', { exact: true }).fill('40');
  await page.getByLabel('Жилая площадь, м²', { exact: true }).fill('45');
  await expect(page.getByText('Жилая площадь больше общей', { exact: true })).toBeVisible();
  await save(page).click(); await expect(page.getByText('Изменения сохранены', { exact: true })).toBeVisible();
  expect(writes(loginServer)[0]!.body).toMatchObject({ data: { object: { totalArea: 40, livingArea: 45 } } });
});

test('потерянный ответ применённой записи сохраняет ввод и исходную версию', async ({ page, loginServer }) => {
  await open(page, loginServer.url); await page.getByLabel('Адрес', { exact: true }).fill('Применено сервером'); loginServer.controls.updateError = 'disconnect-after-write';
  await save(page).click(); await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('Применено сервером');
  loginServer.controls.updateError = null; await save(page).click(); await expect(page.getByText('Объявление изменилось в другом окне', { exact: true })).toBeVisible();
  expect(writes(loginServer)[1]!.body).toMatchObject({ expectedVersion: 2 }); expect(writes(loginServer)).toHaveLength(2);
});

test('очередь фото работает после генерации, замеченной фоновым GET во время редактирования', async ({ page, loginServer }) => {
  const detail = listingDetails(); Object.assign(detail.photos[0]!, { status: 'processing', thumbnailUrl: null }); loginServer.controls.detail = detail;
  await open(page, loginServer.url); await page.getByLabel('Адрес', { exact: true }).fill('Мои правки после генерации');
  loginServer.controls.detail = { ...detail, status: 'generating' };
  await expect(save(page)).toBeDisabled();
  loginServer.controls.detail = { ...detail, status: 'ready' };
  await page.getByRole('button', { name: 'Проверить состояние', exact: true }).click(); await expect(save(page)).toBeEnabled();
  await save(page).click(); await expect(page.getByText('Изменения сохранены', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Отменить редактирование' }).click();
  await page.getByLabel('Фотографии объявления', { exact: true }).setInputFiles({ name: 'after-edit.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('jpeg') });
  await expect(page.getByRole('heading', { name: 'Фото · 2 из 20' })).toBeVisible();
  expect(loginServer.calls.filter((call) => call.method === 'POST' && call.path.endsWith('/photos')).at(-1)!.body).toMatchObject({ expectedVersion: 3 });
});

for (const state of ['conflict', 'busy'] as const) test(`холодный редактор учитывает фоновую блокировку ${state}`, async ({ page, loginServer }) => {
  const detail = listingDetails(); Object.assign(detail.photos[0]!, { status: 'processing', thumbnailUrl: null }); loginServer.controls.detail = detail;
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/assets/EditListing-*.js', async (route) => { await held; await route.continue(); });
  try {
    await page.goto(`${loginServer.url}/app/listings/${id}`);
    await page.getByRole('button', { name: 'Редактировать объявление', exact: true }).click();
    await expect(page.getByText('Загружаем форму', { exact: true })).toBeVisible();
    loginServer.controls.detail = { ...detail, version: state === 'conflict' ? 3 : detail.version, status: state === 'busy' ? 'generating' : detail.status, data: { ...detail.data, location: { ...detail.data.location, address: 'Фоновая версия' } } };
    await expect.poll(() => loginServer.calls.filter((call) => call.method === 'GET' && call.path.endsWith(id)).length).toBeGreaterThan(1);
    await expect(page.getByRole('heading', { name: 'Фоновая версия', exact: true })).toBeVisible();
    release();
    await expect(page.getByText(state === 'conflict' ? 'Объявление изменилось в другом окне' : 'Идёт генерация', { exact: true })).toBeVisible();
    await expect(save(page)).toBeDisabled(); await expect(page.getByRole('button', { name: 'Загрузить актуальные данные' })).toBeEnabled(); expect(writes(loginServer)).toHaveLength(0);
  } finally { release(); }
});

test('ручной повтор PUT401 заново проверяет сессию после GET503', async ({ page, loginServer }) => {
  await open(page, loginServer.url); await page.getByLabel('Адрес', { exact: true }).fill('Мой ввод');
  loginServer.controls.updateError = 401; loginServer.controls.detailError = 503;
  await save(page).click();
  await expect.poll(() => loginServer.calls.filter((call) => call.path.endsWith('/me')).length).toBe(2);
  await expect(page.getByText('Очередь остановлена', { exact: true })).toBeVisible();
  await expect(save(page)).toBeEnabled(); loginServer.controls.meError = 401;
  await save(page).click(); await expect(page.getByRole('heading', { name: 'С возвращением' })).toBeVisible();
  expect(loginServer.calls.filter((call) => call.path.endsWith('/me'))).toHaveLength(3); expect(writes(loginServer)).toHaveLength(2);
});

for (const dialog of ['Мои правки', 'Загрузить актуальные данные?']) test(`сбой проверки сессии скрывает portal ${dialog}`, async ({ page, loginServer }) => {
  await open(page, loginServer.url); await page.getByLabel('Адрес', { exact: true }).fill('Ввод до проверки сессии');
  loginServer.controls.updateError = 409; await save(page).click();
  await page.getByRole('button', { name: dialog === 'Мои правки' ? 'Посмотреть мои правки' : 'Загрузить актуальные данные', exact: true }).click();
  await expect(page.getByRole('dialog', { name: dialog })).toBeVisible();
  loginServer.controls.meError = 503;
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.getByText('Не удалось проверить сессию', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  loginServer.controls.meError = null; await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByRole('dialog', { name: dialog })).toBeVisible();
  await page.getByRole('dialog', { name: dialog }).getByRole('button', { name: 'Вернуться к форме' }).click();
  await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('Ввод до проверки сессии');
});

test('ручной повтор загрузки401 заново проверяет сессию', async ({ page, loginServer }) => {
  await open(page, loginServer.url); await page.getByLabel('Адрес', { exact: true }).fill('Мой ввод');
  loginServer.controls.updateError = 409; await save(page).click(); loginServer.controls.detailError = 401;
  await page.getByRole('button', { name: 'Загрузить актуальные данные', exact: true }).click();
  await page.getByRole('button', { name: 'Загрузить и заменить форму', exact: true }).click();
  await expect.poll(() => loginServer.calls.filter((call) => call.path.endsWith('/me')).length).toBe(2);
  await expect(page.getByText('Не удалось обновить', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Загрузить актуальные данные', exact: true })).toBeEnabled();
  loginServer.controls.meError = 401;
  await page.getByRole('button', { name: 'Загрузить актуальные данные', exact: true }).click();
  await page.getByRole('button', { name: 'Загрузить и заменить форму', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'С возвращением' })).toBeVisible();
  expect(loginServer.calls.filter((call) => call.path.endsWith('/me'))).toHaveLength(3); expect(writes(loginServer)).toHaveLength(1);
});
