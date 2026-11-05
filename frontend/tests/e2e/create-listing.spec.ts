import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { test, expect } from './login-fixture';

const contract = JSON.parse(readFileSync(new URL('../../public/docs/openapi.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: false }); ajv.addSchema({ $id: 'contract', components: contract.components });
const validate = ajv.compile({ $ref: 'contract#/components/schemas/CreateListing' });
const posts = (server: { calls: { path: string; method: string; body: unknown }[] }) => server.calls.filter((call) => call.path === '/api/v1/listings' && call.method === 'POST');

test.beforeEach(async ({ context, loginServer }) => { await context.addCookies([{ name: 'session', value: 'test-session', url: `${loginServer.url}/api/v1` }]); });

for (const width of [320, 390, 768, 1440]) {
  test(`создание: адаптивность, клавиатура и доступность ${width}px`, async ({ page, loginServer }) => {
    await page.setViewportSize({ width, height: 900 }); await page.goto(`${loginServer.url}/app/new`);
    await expect(page.getByRole('form', { name: 'Создание объявления' })).toBeVisible(); expect(posts(loginServer)).toHaveLength(0);
    await page.getByLabel('Тип сделки', { exact: true }).selectOption('rent');
    await page.getByLabel('Тип недвижимости', { exact: true }).selectOption('flat');
    await page.getByLabel('Количество комнат', { exact: true }).fill('0');
    await page.getByLabel('Адрес', { exact: true }).fill('Санкт-Петербург, Лесной проспект, 10');
    await page.getByLabel('Цена за месяц, ₽', { exact: true }).fill('65000');
    await page.getByLabel('Залог, ₽', { exact: true }).fill('0'); await page.getByLabel('Комиссия, %', { exact: true }).fill('0');
    await page.getByLabel('Апартаменты', { exact: true }).selectOption('true');
    await page.getByText('Оснащение', { exact: true }).click(); await page.getByLabel('Мебель', { exact: true }).selectOption('false');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByLabel('Адрес', { exact: true }).focus();
    expect(await page.getByLabel('Адрес', { exact: true }).evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
    await page.getByLabel('Адрес', { exact: true }).press('Enter');
    await expect(page).toHaveURL(`${loginServer.url}/app/listings/70792597-4a2a-4ddb-9d00-c2340dd8c016`);
    await expect(page.getByRole('heading', { name: 'Санкт-Петербург, Лесной проспект, 10' })).toBeVisible();
    await expect(page.getByText('Апартаменты · Длительная аренда')).toBeVisible();
    const body = posts(loginServer)[0]!.body; expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
    expect(body).toMatchObject({ data: { deal: { price: 65000, deposit: 0, commissionPercent: 0 }, object: { roomsCount: 0, isApartments: true }, amenities: { hasFurniture: false } } });
  });
}

for (const deal of ['sale', 'rent', 'daily_rent']) for (const object of ['flat', 'room', 'house', 'apartments']) {
  test(`черновик через HTTP: ${deal}/${object}`, async ({ page, loginServer }) => {
    await page.goto(`${loginServer.url}/app/new`);
    await page.getByLabel('Тип сделки', { exact: true }).selectOption(deal);
    await page.getByLabel('Тип недвижимости', { exact: true }).selectOption(object === 'apartments' ? 'flat' : object);
    if (object === 'apartments') await page.getByLabel('Апартаменты', { exact: true }).selectOption('true');
    if (deal !== 'sale') await page.getByLabel('Залог, ₽', { exact: true }).fill('0');
    await page.getByLabel(object === 'room' ? 'Площадь комнаты, м²' : 'Общая площадь, м²', { exact: true }).fill('34,5');
    if (object === 'house') {
      await page.getByText('Дом и участок', { exact: true }).click();
      await page.getByRole('combobox', { name: 'Материалы дома', exact: true }).click(); await page.getByRole('option', { name: 'Кирпич', exact: true }).click();
      await page.getByLabel('Площадь участка', { exact: true }).fill('8'); await page.getByLabel('Единица площади участка', { exact: true }).selectOption('sotka');
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
    if (deal === 'daily_rent') { await page.getByText('Условия проживания', { exact: true }).click(); await page.getByLabel('Время заезда', { exact: true }).fill('14:00'); }
    await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Новый черновик' })).toBeVisible();
    expect(posts(loginServer)).toHaveLength(1); expect(validate(posts(loginServer)[0]!.body), JSON.stringify(validate.errors)).toBe(true);
  });
}

test('пустой черновик сохраняется без GET/POST при открытии, перезагрузке и смене типов', async ({ page, loginServer }) => {
  await page.goto(`${loginServer.url}/app/new`); await expect(page.getByLabel('Адрес', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByLabel('Адрес', { exact: true })).toBeVisible(); expect(posts(loginServer)).toHaveLength(0);
  await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Новый черновик' })).toBeVisible(); expect(posts(loginServer)[0]!.body).toEqual({ data: {} });
});

test('переключение типов исключает поля старой сделки и объекта, неизвестно очищает флаг', async ({ page, loginServer }) => {
  await page.goto(`${loginServer.url}/app/new`);
  await page.getByLabel('Тип сделки', { exact: true }).selectOption('rent'); await page.getByLabel('Тип недвижимости', { exact: true }).selectOption('flat');
  await page.getByLabel('Количество комнат', { exact: true }).fill('0'); await page.getByLabel('Залог, ₽', { exact: true }).fill('0');
  await page.getByLabel('Апартаменты', { exact: true }).selectOption('true'); await page.getByLabel('Общая площадь, м²', { exact: true }).fill('54');
  await page.getByText('Здание', { exact: true }).click(); await page.getByLabel('Этажей в здании', { exact: true }).fill('12');
  await page.getByLabel('Тип недвижимости', { exact: true }).selectOption('house'); await page.getByLabel('Тип сделки', { exact: true }).selectOption('sale');
  await expect(page.getByLabel('Залог, ₽', { exact: true })).toHaveCount(0); await expect(page.getByLabel('Количество комнат', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Новый черновик' })).toBeVisible();
  expect(posts(loginServer)[0]!.body).toEqual({ data: { deal: { type: 'sale' }, object: { type: 'house', totalArea: 54 } } });
});

for (const failure of [403, 422, 503, 'network', 'invalid', 'wrong-status', 'broken-json'] as const) {
  test(`ошибка сохранения ${failure}: ввод и ручной повтор`, async ({ page, loginServer }) => {
    loginServer.controls.createError = failure; loginServer.controls.createFields = ['/data/house/landArea', '/data/unknown'];
    await page.goto(`${loginServer.url}/app/new`); await page.getByLabel('Тип недвижимости', { exact: true }).selectOption('house');
    await page.getByLabel('Адрес', { exact: true }).fill('Не терять введённый адрес');
    await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click(); await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('Не терять введённый адрес'); expect(posts(loginServer)).toHaveLength(1);
    await expect(page.getByRole('alert')).not.toContainText('Technical');
    if (failure === 422) { await expect(page.getByLabel('Площадь участка', { exact: true })).toBeFocused(); await expect(page.getByLabel('Площадь участка', { exact: true })).toHaveAttribute('aria-invalid', 'true'); }
    loginServer.controls.createError = null;
    await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Не терять введённый адрес' })).toBeVisible(); expect(posts(loginServer)).toHaveLength(2);
  });
}

test('валидация, фокус, предупреждения и метро через реальный HTTP', async ({ page, loginServer }) => {
  await page.goto(`${loginServer.url}/app/new`); await page.getByLabel('Тип недвижимости', { exact: true }).selectOption('flat');
  await page.getByText('Здание', { exact: true }).click(); await page.getByLabel('Этажей в здании', { exact: true }).fill('0');
  await page.getByText('Здание', { exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click(); await expect(page.getByLabel('Этажей в здании', { exact: true })).toBeFocused(); expect(posts(loginServer)).toHaveLength(0);
  await page.getByLabel('Этажей в здании', { exact: true }).fill('9'); await page.getByLabel('Этаж', { exact: true }).fill('10');
  await page.getByLabel('Общая площадь, м²', { exact: true }).fill('54'); await page.getByLabel('Жилая площадь, м²', { exact: true }).fill('55');
  await page.getByRole('button', { name: 'Добавить станцию метро' }).click(); await page.getByLabel('Время в пути, мин — станция 1').fill('0');
  await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click(); await expect(page.getByLabel('Название станции 1')).toBeFocused(); expect(posts(loginServer)).toHaveLength(0);
  await page.getByLabel('Название станции 1').fill('Лесная'); await expect(page.getByText('Этаж выше этажности здания')).toBeVisible(); await expect(page.getByText('Жилая площадь больше общей')).toBeVisible();
  await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Новый черновик' })).toBeVisible(); expect(validate(posts(loginServer)[0]!.body)).toBe(true);
});

test('синхронная блокировка повторного POST, ожидание правильного ответа', async ({ page, loginServer }) => {
  let release!: () => void; loginServer.controls.holdCreate = new Promise((resolve) => { release = resolve; });
  await page.goto(`${loginServer.url}/app/new`); await expect(page.getByLabel('Адрес', { exact: true })).toBeVisible();
  await page.getByRole('form', { name: 'Создание объявления' }).evaluate((form: HTMLFormElement) => { form.requestSubmit(); form.requestSubmit(); });
  await expect(page.getByText('Сохраняем объявление', { exact: true })).toBeVisible(); expect(posts(loginServer)).toHaveLength(1);
  await expect(page.getByLabel('Адрес', { exact: true })).toBeDisabled(); await expect(page).toHaveURL(`${loginServer.url}/app/new`);
  release(); await expect(page.getByRole('heading', { name: 'Новый черновик' })).toBeVisible(); expect(posts(loginServer)).toHaveLength(1);
});

test('несохранённые данные: отмена и подтверждение ухода, Back/Forward, перезагрузка и хранилище', async ({ page, loginServer }) => {
  await page.goto(`${loginServer.url}/app`); await page.getByRole('button', { name: 'Создать объявление', exact: true }).first().click();
  await page.getByLabel('Адрес', { exact: true }).fill('Секретный черновик');
  page.on('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: '← Мои объявления' }).click(); await expect(page).toHaveURL(`${loginServer.url}/app/new`);
  await page.goBack(); await expect(page).toHaveURL(`${loginServer.url}/app/new`); await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('Секретный черновик');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]); expect(posts(loginServer)).toHaveLength(0);
  page.removeAllListeners('dialog'); page.on('dialog', (dialog) => dialog.accept());
  await page.goBack(); await expect(page).toHaveURL(`${loginServer.url}/app`);
  await page.goForward(); await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('');
});

test('401 повторно проверяет сессию, сохраняет данные при действующей сессии и закрывает страницу при истечении', async ({ page, loginServer }) => {
  loginServer.controls.createError = 401;
  await page.goto(`${loginServer.url}/app/new`); await page.getByLabel('Адрес', { exact: true }).fill('Не терять');
  await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
  await expect.poll(() => loginServer.calls.filter((call) => call.path.endsWith('/me')).length).toBe(2); await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('Не терять');
  loginServer.controls.meError = 401; await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'С возвращением' })).toBeVisible(); expect(posts(loginServer)).toHaveLength(2);
});

test('уход во время POST игнорирует поздний 401', async ({ page, loginServer }) => {
  let release!: () => void; loginServer.controls.holdCreate = new Promise((resolve) => { release = resolve; }); loginServer.controls.createError = 401;
  await page.goto(`${loginServer.url}/app/new`); await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click(); await expect(page.getByText('Сохраняем объявление', { exact: true })).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept()); await page.getByRole('button', { name: '← Мои объявления' }).click(); await expect(page.getByRole('heading', { name: 'Мои объявления' })).toBeVisible();
  release(); await expect(page.getByRole('heading', { name: 'Мои объявления' })).toBeVisible(); expect(loginServer.calls.filter((call) => call.path.endsWith('/me'))).toHaveLength(1);
});

test('прямая ссылка создания защищена сессией', async ({ page, context, loginServer }) => {
  await context.clearCookies(); await page.goto(`${loginServer.url}/app/new`);
  await expect(page.getByRole('heading', { name: 'С возвращением' })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Создание объявления' })).toHaveCount(0); expect(posts(loginServer)).toHaveLength(0);
});

test('ошибка API метро фокусирует отправленную станцию после пустой строки', async ({ page, loginServer }) => {
  loginServer.controls.createError = 422; loginServer.controls.createFields = ['/data/location/undergrounds/0/minutes'];
  await page.goto(`${loginServer.url}/app/new`);
  await page.getByRole('button', { name: 'Добавить станцию метро' }).click();
  await page.getByRole('button', { name: 'Добавить станцию метро' }).click();
  await page.getByLabel('Название станции 2').fill('Лесная'); await page.getByLabel('Время в пути, мин — станция 2').fill('7');
  await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Время в пути, мин — станция 2')).toBeFocused();
  await expect(page.getByLabel('Время в пути, мин — станция 1')).not.toHaveAttribute('aria-invalid', 'true');
});

test('skip-ссылка и отмена Back сохраняют маршрут и черновик', async ({ page, loginServer }) => {
  await page.goto(`${loginServer.url}/app`); await page.getByRole('button', { name: 'Создать объявление', exact: true }).first().click();
  const skip = page.getByRole('link', { name: 'К содержимому', exact: true }); await skip.focus(); await skip.press('Enter');
  await expect(page).toHaveURL(`${loginServer.url}/app/new#main-content`);
  await page.getByLabel('Адрес', { exact: true }).fill('Сохранить черновик');
  let dialogs = 0; page.on('dialog', (dialog) => { dialogs += 1; void dialog.dismiss(); });
  await page.goBack();
  await expect(page).toHaveURL(`${loginServer.url}/app/new`); expect(dialogs).toBe(0);
  await page.goBack(); await expect.poll(() => dialogs).toBe(1);
  await expect(page).toHaveURL(`${loginServer.url}/app/new`); await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('Сохранить черновик');
  page.removeAllListeners('dialog'); page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '← Мои объявления' }).click(); await expect(page.getByRole('heading', { name: 'Мои объявления' })).toBeVisible();
});

test('несохранённый черновик защищён при ошибке проверки сессии', async ({ page, loginServer }) => {
  await page.goto(`${loginServer.url}/app`); await page.getByRole('button', { name: 'Создать объявление', exact: true }).first().click();
  await page.getByLabel('Адрес', { exact: true }).fill('Не терять после 401');
  loginServer.controls.createError = 401; loginServer.controls.meError = 503;
  await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
  await expect(page.getByText('Не удалось проверить сессию', { exact: true })).toBeVisible();
  let dialogs = 0; page.on('dialog', (dialog) => { dialogs += 1; void dialog.dismiss(); });
  await page.goBack(); await expect.poll(() => dialogs).toBe(1); await expect(page).toHaveURL(`${loginServer.url}/app/new`);
  loginServer.controls.meError = null; await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue('Не терять после 401');
  page.removeAllListeners('dialog'); page.on('dialog', (dialog) => dialog.accept());
});
