import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './login-fixture';
import { listingItems } from '../fixtures/listings';

for (const width of [320, 390, 768, 1440]) {
  test(`объявления: данные, доступность и адаптивность ${width}px`, async ({ page, context, loginServer }) => {
    await context.addCookies([{ name: 'session', value: 'test-session', url: `${loginServer.url}/api/v1` }]);
    loginServer.controls.listingPages = [{ items: listingItems, nextCursor: null }];
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${loginServer.url}/app`);
    const list = page.getByRole('list', { name: 'Мои объявления' });
    await expect(list.getByRole('listitem')).toHaveCount(5);
    await expect(list).toContainText('999\u00a0999\u00a0999\u00a0999\u00a0999\u00a0999\u00a0999,99\u00a0₽');
    await expect(list).toContainText('62\u00a0000,50\u00a0₽ / мес.');
    await expect(list).toContainText('4\u00a0500\u00a0₽ / сутки');
    await expect(list.getByRole('listitem').nth(3)).toContainText('Результат готов');
    await expect(list.getByRole('listitem').nth(3)).toContainText('Последний запуск: ошибка');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await list.getByRole('link').first().focus();
    expect(await list.getByRole('link').first().evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Объявление', exact: true })).toBeVisible();
    await expect(page.getByText(/Здесь доступны основные данные/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Здесь доступны основные данные/)).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(`${loginServer.url}/app`);
    await page.goForward();
    await expect(page).toHaveURL(`${loginServer.url}/app/listings/${listingItems[0]!.id}`);
    await page.getByRole('button', { name: '← Мои объявления' }).click();
    await page.getByRole('button', { name: 'Создать объявление' }).click();
    await expect(page.getByRole('heading', { name: 'Новое объявление' })).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Форма создания объявления появится позже/)).toBeVisible();
    expect(loginServer.calls.every((call) => call.method === 'GET')).toBe(true);
  });
}

test('пагинация: непрозрачный cursor, ошибка с сохранением списка, повтор и конец', async ({ page, context, loginServer }) => {
  await context.addCookies([{ name: 'session', value: 'test-session', url: `${loginServer.url}/api/v1` }]);
  loginServer.controls.listingPages = [{ items: [listingItems[0]], nextCursor: 'opaque+/=&?' }, { items: [listingItems[0], listingItems[1]], nextCursor: null }];
  await page.goto(`${loginServer.url}/app`);
  const more = page.getByRole('button', { name: 'Показать ещё' });
  await expect(more).toBeVisible();
  loginServer.controls.listingError = 503;
  await more.click();
  await expect(page.getByRole('alert')).toContainText('следующую страницу');
  await expect(page.getByRole('listitem')).toHaveCount(1);
  loginServer.controls.listingError = null;
  let release!: () => void;
  loginServer.controls.holdListings = new Promise((resolve) => { release = resolve; });
  await page.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByText('Загружаем ещё объявления')).toBeVisible();
  release();
  await expect(page.getByRole('listitem')).toHaveCount(2);
  await expect(page.getByText('Все объявления загружены')).toBeVisible();
  await expect(more).toHaveCount(0);
  const calls = loginServer.calls.filter((call) => call.path === '/api/v1/listings');
  expect(calls).toHaveLength(3);
  for (const call of calls.slice(1)) expect(new URLSearchParams(call.query).get('cursor')).toBe('opaque+/=&?');
});

for (const state of ['network', 'invalid', 500, 501] as const) {
  test(`ошибка списка ${state}, ручной повтор и пустой список`, async ({ page, context, loginServer }) => {
    await context.addCookies([{ name: 'session', value: 'test-session', url: `${loginServer.url}/api/v1` }]);
    loginServer.controls.listingError = state;
    await page.goto(`${loginServer.url}/app`);
    await expect(page.getByRole('alert')).toContainText('Не удалось загрузить объявления');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await expect(page.getByText('Пока нет объявлений')).toHaveCount(0);
    loginServer.controls.listingError = null;
    await page.getByRole('button', { name: 'Повторить' }).click();
    await expect(page.getByRole('heading', { name: 'Пока нет объявлений' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('main').getByRole('button', { name: 'Создать объявление' }).last().click();
    await expect(page.getByRole('heading', { name: 'Новое объявление' })).toBeVisible();
    expect(loginServer.calls.filter((call) => call.method !== 'GET')).toEqual([]);
  });
}

test('401 списка перепроверяет сессию; 5xx /me не выдаётся за выход', async ({ page, context, loginServer }) => {
  await context.addCookies([{ name: 'session', value: 'test-session', url: `${loginServer.url}/api/v1` }]);
  let release!: () => void;
  loginServer.controls.holdListings = new Promise((resolve) => { release = resolve; });
  await page.goto(`${loginServer.url}/app`);
  await expect(page.getByText('Загружаем объявления')).toBeVisible();
  loginServer.controls.listingError = 401;
  loginServer.controls.meError = 503;
  release();
  await expect(page.getByRole('alert')).toContainText('Не удалось проверить сессию');
  await expect(page).toHaveURL(`${loginServer.url}/app`);
  loginServer.controls.meError = 401;
  await page.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByRole('heading', { name: 'С возвращением' })).toBeVisible();
});

test('поздние объявления после выхода, другой пользователь и восстановление BFCache', async ({ page, context, loginServer }) => {
  await context.addCookies([{ name: 'session', value: 'test-session', url: `${loginServer.url}/api/v1` }]);
  let release!: () => void;
  loginServer.controls.listingPages = [{ items: listingItems, nextCursor: null }];
  loginServer.controls.holdListings = new Promise((resolve) => { release = resolve; });
  await page.goto(`${loginServer.url}/app`);
  await expect(page.getByText('Загружаем объявления')).toBeVisible();
  await page.getByRole('button', { name: /Меню пользователя/ }).click();
  await page.getByRole('menuitem', { name: 'Выйти' }).click();
  await expect(page.getByRole('heading', { name: 'С возвращением' })).toBeVisible();
  release();
  await expect(page.getByText(/Лесной проспект/)).toHaveCount(0);
  loginServer.controls.listingPages = [{ items: [], nextCursor: null }];
  loginServer.controls.userId = '9a07b31d-ac15-495c-bb91-e3756fe40bcd';
  await page.getByRole('textbox', { name: /^Логин/ }).fill('another_agent');
  await page.getByLabel('Пароль', { exact: true }).fill('other password');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByText('Пока нет объявлений')).toBeVisible();
  loginServer.controls.meError = 401;
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.getByRole('heading', { name: 'С возвращением' })).toBeVisible();
  await expect(page.getByText('Пока нет объявлений')).toHaveCount(0);
});
