import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './login-fixture';

for (const width of [320, 390, 768, 1440]) {
  test(`вход: клавиатура, доступность и геометрия ${width}px`, async ({ page, loginServer }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${loginServer.url}/login`);
    await expect(page.getByRole('heading', { name: 'С возвращением' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^Логин/ })).toHaveAttribute('autocomplete', 'username');
    await expect(page.getByLabel('Пароль', { exact: false })).toHaveAttribute('autocomplete', 'current-password');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(page.getByRole('textbox', { name: /^Логин/ })).toBeFocused();
    expect(loginServer.calls.filter((call) => call.path.endsWith('/login'))).toHaveLength(0);
    await expect(page.getByRole('textbox', { name: /^Логин/ })).toHaveAccessibleDescription('Введите логин');
    await page.keyboard.type('a');
    await page.keyboard.press('Tab');
    await page.keyboard.type('  x  ');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Показать пароль' })).toBeFocused();
    const focus = await page.getByRole('button', { name: 'Показать пароль' }).evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(focus).not.toBe('none');
    await page.keyboard.press('Space');
    await expect(page.getByLabel('Пароль', { exact: false })).toHaveAttribute('type', 'text');
    await page.keyboard.press('Space');
    await expect(page.getByLabel('Пароль', { exact: false })).toHaveAttribute('type', 'password');
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(accessibility.violations).toEqual([]);
    await page.getByLabel('Пароль', { exact: false }).press('Enter');
    await expect(page).toHaveURL(`${loginServer.url}/app`);
    await expect(page.getByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
    expect(loginServer.calls.find((call) => call.path.endsWith('/login'))?.body).toEqual({ login: 'a', password: '  x  ' });
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  });
}

test('cookie, перезагрузка, прямой адрес, Back/Forward и выход', async ({ page, context, loginServer }) => {
  await page.goto(loginServer.url);
  await page.getByRole('main').getByRole('button', { name: 'Начать работу' }).click();
  await expect(page).toHaveURL(`${loginServer.url}/login`);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Поможем рассказать о доме главное' })).toBeVisible();
  await page.goForward();
  await page.getByRole('textbox', { name: /^Логин/ }).fill('agent_demo');
  await page.getByLabel('Пароль', { exact: false }).fill('x');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
  expect((await context.cookies()).find((cookie) => cookie.name === 'session')).toMatchObject({ httpOnly: true, path: '/api/v1', sameSite: 'Lax' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
  expect(loginServer.calls.filter((call) => call.path.endsWith('/me')).at(-1)?.cookie).toContain('session=test-session');
  expect(await page.evaluate(() => document.cookie)).not.toContain('session=');
  await page.goto(`${loginServer.url}/login?returnTo=https://attacker.invalid/`);
  await expect(page).toHaveURL(`${loginServer.url}/app`);
  await page.goto(loginServer.url);
  await expect.poll(() => loginServer.calls.filter((call) => call.path.endsWith('/me')).length).toBeGreaterThan(2);
  await page.getByRole('main').getByRole('button', { name: 'Начать работу' }).click();
  await expect(page).toHaveURL(`${loginServer.url}/app`);
  loginServer.controls.failLogout = true;
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось выйти');
  await expect(page.getByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
  loginServer.controls.failLogout = false;
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page).toHaveURL(`${loginServer.url}/login`);
  await page.goBack();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Личный кабинет' })).toHaveCount(0);
  await page.goto(`${loginServer.url}/app`);
  await expect(page).toHaveURL(`${loginServer.url}/login`);
  await expect(page.getByRole('heading', { name: 'Личный кабинет' })).toHaveCount(0);
});

for (const [failure, message] of [
  [401, 'Неверный логин или пароль'], [422, 'Проверьте логин и пароль'],
  [429, 'Повторите через 30 с.'], [503, 'Сервис временно недоступен'],
  ['network', 'Нет связи с сервером'], ['invalid', 'Не удалось получить ответ'],
] as const) {
  test(`ошибка входа ${failure}, без автоматического POST`, async ({ page, loginServer }) => {
    loginServer.controls.loginError = failure;
    await page.goto(`${loginServer.url}/login`);
    await page.getByRole('textbox', { name: /^Логин/ }).fill('a');
    await page.getByLabel('Пароль', { exact: false }).fill('x');
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(page.getByRole('heading', { name: 'Личный кабинет' })).toHaveCount(0);
    expect(loginServer.calls.filter((call) => call.path.endsWith('/login'))).toHaveLength(1);
    await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeEnabled();
    if (failure === 422) {
      await expect(page.getByRole('textbox', { name: /^Логин/ })).toHaveAccessibleDescription('Проверьте логин');
      await expect(page.getByText('Technical diagnostic')).toHaveCount(0);
    }
  });
}

test('отправка блокирует повторы и допускается до завершения /me', async ({ page, loginServer }) => {
  let releaseMe!: () => void;
  let releaseLogin!: () => void;
  loginServer.controls.holdMe = new Promise((resolve) => { releaseMe = resolve; });
  loginServer.controls.holdLogin = new Promise((resolve) => { releaseLogin = resolve; });
  await page.goto(`${loginServer.url}/login`);
  await page.getByRole('textbox', { name: /^Логин/ }).fill('a');
  await page.getByLabel('Пароль', { exact: false }).fill('x');
  await page.getByRole('button', { name: 'Войти', exact: true }).dblclick();
  await expect(page.getByRole('button', { name: 'Входим…' })).toBeDisabled();
  await expect(page.getByRole('textbox', { name: /^Логин/ })).toBeDisabled();
  await expect(page.getByLabel('Пароль', { exact: false })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Показать пароль' })).toBeDisabled();
  expect(loginServer.calls.filter((call) => call.path.endsWith('/login'))).toHaveLength(1);
  releaseLogin();
  await expect(page.getByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
  releaseMe();
  await expect(page.getByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
});

test('сбой /me на защищённом адресе оставляет доступ ко входу', async ({ page, loginServer }) => {
  loginServer.controls.meError = 503;
  await page.goto(`${loginServer.url}/app`);
  await expect(page.getByRole('alert')).toContainText('Не удалось проверить сессию');
  await expect(page.getByRole('heading', { name: 'Личный кабинет' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Войти в аккаунт' }).click();
  await page.getByRole('textbox', { name: /^Логин/ }).fill('a');
  await page.getByLabel('Пароль', { exact: false }).fill('x');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
});

test('ожидание восстановления не показывает защищённые данные гостю', async ({ page, loginServer }) => {
  let release!: () => void;
  loginServer.controls.holdMe = new Promise((resolve) => { release = resolve; });
  await page.goto(`${loginServer.url}/app`);
  await expect(page.getByText('Проверяем сессию')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Личный кабинет' })).toHaveCount(0);
  release();
  await expect(page).toHaveURL(`${loginServer.url}/login`);
});
