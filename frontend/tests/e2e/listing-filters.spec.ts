import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './login-fixture';
import { listing, listingItems } from '../fixtures/listings';

const filters = (server: { calls: { path: string; query: string }[] }) => server.calls.filter((call) => call.path === '/api/v1/listings');

test.beforeEach(async ({ context, loginServer }) => {
  await context.addCookies([{ name: 'session', value: 'test-session', url: `${loginServer.url}/api/v1` }]);
  loginServer.controls.listingDataset = listingItems;
});
for (const width of [320, 390, 768, 1440]) {
  test(`фильтры: адрес и период, доступность ${width}px`, async ({ page, loginServer }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${loginServer.url}/app?q=лЕсНой&from=2026-10-23&to=2026-10-23`);
    await expect(page.getByRole('listitem')).toHaveCount(1);
    const params = new URLSearchParams(filters(loginServer)[0]!.query);
    expect(params.get('q')).toBe('лЕсНой'); expect(params.get('limit')).toBe('20');
    expect(params.get('from')).toBe('2026-10-22T21:00:00.000Z');
    expect(params.get('to')).toBe('2026-10-23T21:00:00.000Z');
    expect(params.has('cursor')).toBe(false);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const input = page.getByLabel('Поиск по адресу');
    await input.focus(); expect(await input.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
    await input.fill('нет совпадений'); await input.press('Enter');
    await expect(page.getByRole('heading', { name: 'Ничего не найдено' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Сбросить фильтры' }).last().click();
    await expect(page.getByRole('listitem')).toHaveCount(5);
    await expect(page).toHaveURL(`${loginServer.url}/app`);
  });
}

test('debounce, Enter, reload, прямая ссылка, Back/Forward и отмена отложенного ввода', async ({ page, loginServer }) => {
  await page.goto(`${loginServer.url}/app`);
  await expect(page.getByRole('listitem')).toHaveCount(5);
  const input = page.getByLabel('Поиск по адресу');
  const length = await page.evaluate(() => history.length);
  await input.pressSequentially('Лесной', { delay: 30 });
  await expect.poll(() => filters(loginServer).length).toBe(2);
  expect(await page.evaluate(() => history.length)).toBe(length + 1);
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await input.fill('Бер'); await input.press('Enter');
  await expect(page.getByRole('list')).toContainText('Берггольц');
  await page.reload(); await expect(input).toHaveValue('Бер'); await expect(page.getByRole('listitem')).toHaveCount(1);
  await page.goBack(); await expect(input).toHaveValue('Лесной'); await expect(page.getByRole('list')).toContainText('Лесной');
  await input.fill('не применено');
  await page.goForward(); await expect(input).toHaveValue('Бер'); await expect(page.getByRole('list')).toContainText('Берггольц');
  await page.waitForTimeout(350); await expect(input).toHaveValue('Бер');
  await input.fill(''); await input.press('Enter'); await expect(page.getByRole('listitem')).toHaveCount(5);
  expect(new URLSearchParams(filters(loginServer).at(-1)!.query).has('q')).toBe(false);
});

test('неверный диапазон не отправляется; односторонние даты и ошибка URL', async ({ page, loginServer }) => {
  await page.goto(`${loginServer.url}/app?from=2026-02-30`);
  await expect(page.getByRole('alert')).toContainText('корректные даты'); expect(filters(loginServer)).toHaveLength(0);
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(5);
  await page.getByLabel('Дата создания: с').fill('2026-10-22');
  await expect(page.getByRole('listitem')).toHaveCount(2);
  expect(new URLSearchParams(filters(loginServer).at(-1)!.query).has('to')).toBe(false);
  const count = filters(loginServer).length;
  await page.getByLabel('Дата создания: по').fill('2026-10-21');
  await expect(page.getByRole('alert')).toContainText('позже конца');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Найти', exact: true }).click();
  await page.waitForTimeout(350); expect(filters(loginServer)).toHaveLength(count);
  await page.getByLabel('Дата создания: с').fill('');
  await expect(page.getByRole('listitem')).toHaveCount(3);
  expect(new URLSearchParams(filters(loginServer).at(-1)!.query).has('from')).toBe(false);
});

test('период в часовом поясе браузера включает границы и исключает следующий день', async ({ browser, loginServer }) => {
  const context = await browser.newContext({ timezoneId: 'America/New_York' });
  try {
    await context.addCookies([{ name: 'session', value: 'test-session', url: `${loginServer.url}/api/v1` }]);
    loginServer.controls.listingDataset = ['2026-03-08T04:59:59Z', '2026-03-08T05:00:00Z', '2026-03-09T03:59:59Z', '2026-03-09T04:00:00Z'].map((createdAt, i) => listing({ id: listingItems[i]!.id, createdAt }));
    const page = await context.newPage();
    await page.goto(`${loginServer.url}/app?from=2026-03-08&to=2026-03-08`);
    await expect(page.getByRole('listitem')).toHaveCount(2);
    const params = new URLSearchParams(filters(loginServer)[0]!.query);
    expect(params.get('from')).toBe('2026-03-08T05:00:00.000Z'); expect(params.get('to')).toBe('2026-03-09T04:00:00.000Z');
  } finally { await context.close(); }
});

test('пагинация, ошибка догрузки и новый фильтр сохраняют правильный набор', async ({ page, loginServer }) => {
  loginServer.controls.listingPageSize = 1;
  await page.goto(`${loginServer.url}/app?from=2026-10-19`);
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Показать ещё' }).click(); await expect(page.getByRole('listitem')).toHaveCount(2);
  loginServer.controls.listingError = 503;
  await page.getByRole('button', { name: 'Показать ещё' }).click(); await expect(page.getByRole('alert')).toContainText('следующую страницу');
  await expect(page.getByRole('listitem')).toHaveCount(2);
  loginServer.controls.listingError = null;
  await page.getByRole('button', { name: 'Повторить' }).click(); await expect(page.getByRole('listitem')).toHaveCount(3);
  const input = page.getByLabel('Поиск по адресу'); await input.fill('Лесной'); await input.press('Enter');
  await expect(page.getByRole('listitem')).toHaveCount(1); await expect(page.getByText('Все объявления загружены')).toBeVisible();
  const params = new URLSearchParams(filters(loginServer).at(-1)!.query);
  expect(params.get('q')).toBe('Лесной'); expect(params.has('cursor')).toBe(false); expect(params.has('from')).toBe(true);
});

test('смена фильтра во время запроса игнорирует старую выдачу', async ({ page, loginServer }) => {
  let release!: () => void;
  loginServer.controls.holdListings = new Promise((resolve) => { release = resolve; });
  await page.goto(`${loginServer.url}/app`); await expect(page.getByText('Загружаем объявления')).toBeVisible();
  loginServer.controls.holdListings = undefined;
  await page.getByLabel('Поиск по адресу').fill('Берггольц'); await page.getByLabel('Поиск по адресу').press('Enter');
  await expect(page.getByRole('listitem')).toHaveCount(1); await expect(page.getByRole('list')).toContainText('Берггольц');
  release(); await expect(page.getByRole('listitem')).toHaveCount(1); await expect(page.getByRole('list')).toContainText('Берггольц');
});

for (const action of ['logout', 'expired'] as const) {
  test(`фильтры: ${action} во время загрузки не возвращает старые данные`, async ({ page, loginServer }) => {
    let release!: () => void;
    loginServer.controls.holdListings = new Promise((resolve) => { release = resolve; });
    await page.goto(`${loginServer.url}/app?q=Лесной&from=2026-10-01`);
    await expect(page.getByText('Загружаем объявления')).toBeVisible();
    if (action === 'logout') {
      await page.getByRole('button', { name: /Меню пользователя/ }).click();
      await page.getByRole('menuitem', { name: 'Выйти' }).click();
    } else {
      loginServer.controls.listingError = 401; loginServer.controls.meError = 401; release();
    }
    await expect(page.getByRole('heading', { name: 'С возвращением' })).toBeVisible();
    release(); await expect(page.getByRole('list', { name: 'Мои объявления' })).toHaveCount(0);
  });
}
