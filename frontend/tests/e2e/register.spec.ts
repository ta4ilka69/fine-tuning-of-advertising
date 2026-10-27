import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './login-fixture';

for (const width of [320, 390, 768, 1440]) {
  test(`регистрация: клавиатура, доступность и геометрия ${width}px`, async ({ page, loginServer }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${loginServer.url}/register`);
    await expect(page.getByRole('heading', { name: 'Создать аккаунт' })).toBeVisible();
    await expect(page).toHaveTitle('Регистрация');
    const login = page.getByRole('textbox', { name: /^Логин/ });
    const password = page.getByLabel('Пароль', { exact: true });
    await expect(login).toHaveAttribute('autocomplete', 'username');
    await expect(password).toHaveAttribute('autocomplete', 'new-password');
    await expect(login).toHaveAccessibleDescription(/3–32 символа/);
    await expect(password).toHaveAccessibleDescription('От 12 до 128 символов');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click();
    await expect(login).toBeFocused();
    await expect(login).toHaveAccessibleDescription(/Введите логин/);
    await expect(password).toHaveAccessibleDescription(/Введите пароль/);
    expect(loginServer.calls.filter((call) => call.path.endsWith('/register'))).toHaveLength(0);
    await page.keyboard.type('Agent_Demo');
    await page.keyboard.press('Tab');
    await page.keyboard.type('  password 123  ');
    await page.keyboard.press('Tab');
    const toggle = page.getByRole('button', { name: 'Показать пароль' });
    await expect(toggle).toBeFocused();
    expect(await toggle.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
    await page.keyboard.press('Space');
    await expect(password).toHaveAttribute('type', 'text');
    await page.keyboard.press('Space');
    await expect(password).toHaveAttribute('type', 'password');
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await password.press('Enter');
    await expect(page).toHaveURL(`${loginServer.url}/app`);
    await expect(page.getByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
    expect(loginServer.calls.find((call) => call.path.endsWith('/register'))).toMatchObject({
      body: { login: 'Agent_Demo', password: '  password 123  ' }, method: 'POST', origin: loginServer.url,
    });
    expect(loginServer.calls.filter((call) => call.path.endsWith('/login'))).toHaveLength(0);
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
    expect(page.url()).not.toContain('password');
  });
}

test('вход ↔ регистрация, Back/Forward, перезагрузка, cookie и выход', async ({ page, context, loginServer }) => {
  await page.goto(`${loginServer.url}/login`);
  await page.getByRole('link', { name: 'Зарегистрироваться' }).click();
  await expect(page).toHaveURL(`${loginServer.url}/register`);
  await expect(page.getByRole('heading', { name: 'Создать аккаунт' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Создать аккаунт' })).toBeVisible();
  await page.getByRole('link', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'С возвращением' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Создать аккаунт' })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'С возвращением' })).toBeVisible();
  await page.getByRole('link', { name: 'Зарегистрироваться' }).click();
  await page.getByRole('textbox', { name: /^Логин/ }).fill('agent_demo');
  await page.getByLabel('Пароль', { exact: true }).fill(' '.repeat(12));
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
  expect((await context.cookies()).find((cookie) => cookie.name === 'session')).toMatchObject({ httpOnly: true, path: '/api/v1', sameSite: 'Lax' });
  expect(await page.evaluate(() => document.cookie)).not.toContain('session=');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
  expect(loginServer.calls.filter((call) => call.path.endsWith('/me')).at(-1)?.cookie).toContain('session=test-session');
  await page.goto(`${loginServer.url}/register?returnTo=https://attacker.invalid/`);
  await expect(page).toHaveURL(`${loginServer.url}/app`);
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'С возвращением' })).toBeVisible();
  await page.goto(`${loginServer.url}/app`);
  await expect(page.getByRole('heading', { name: 'Личный кабинет' })).toHaveCount(0);
  await expect(page).toHaveURL(`${loginServer.url}/login`);
});

test('занятый логин: 409 без специального кода, исправление и повтор', async ({ page, loginServer }) => {
  loginServer.controls.registerError = 409;
  await page.goto(`${loginServer.url}/register`);
  const login = page.getByRole('textbox', { name: /^Логин/ });
  await login.fill('agent_demo');
  await page.getByLabel('Пароль', { exact: true }).fill('test password');
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Логин уже занят');
  await expect(login).toHaveAccessibleDescription(/Этот логин уже занят/);
  await expect(login).toBeFocused();
  expect(loginServer.calls.filter((call) => call.path.endsWith('/register'))).toHaveLength(1);
  loginServer.controls.registerError = null;
  await login.fill('another_agent');
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
  expect(loginServer.calls.filter((call) => call.path.endsWith('/register'))).toHaveLength(2);
});

for (const [failure, message] of [
  [400, 'Проверьте логин и пароль'], [422, 'Проверьте логин и пароль'],
  [429, 'Повторите через 30 с.'], [500, 'Сервис временно недоступен'], [503, 'Сервис временно недоступен'],
  ['network', 'Нет связи с сервером'], ['invalid', 'Не удалось получить ответ'],
  ['broken-json', 'Не удалось получить ответ'], ['wrong-status', 'Не удалось получить ответ'],
] as const) {
  test(`ошибка регистрации ${failure}, без автоматического POST`, async ({ page, loginServer }) => {
    loginServer.controls.registerError = failure;
    loginServer.controls.registerFields = ['/password', '/unknown'];
    await page.goto(`${loginServer.url}/register`);
    await page.getByRole('textbox', { name: /^Логин/ }).fill('agent_demo');
    const password = page.getByLabel('Пароль', { exact: true });
    await password.fill('test password');
    await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(message);
    expect(loginServer.calls.filter((call) => call.path.endsWith('/register'))).toHaveLength(1);
    await expect(page.getByRole('button', { name: 'Зарегистрироваться', exact: true })).toBeEnabled();
    await expect(page.getByText('Technical diagnostic')).toHaveCount(0);
    if (failure === 400 || failure === 422) {
      await expect(password).toHaveAccessibleDescription(/Проверьте пароль/);
      await expect(password).toBeFocused();
    }
  });
}

for (const retryAfter of [null, '-1', '1.5', 'tomorrow']) {
  test(`429: недопустимый Retry-After ${retryAfter} не выдумывает ожидание`, async ({ page, loginServer }) => {
    loginServer.controls.registerError = 429;
    loginServer.controls.retryAfter = retryAfter;
    await page.goto(`${loginServer.url}/register`);
    await page.getByRole('textbox', { name: /^Логин/ }).fill('agent_demo');
    await page.getByLabel('Пароль', { exact: true }).fill('test password');
    await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Слишком много попыток. Попробуйте позже.');
    expect(loginServer.calls.filter((call) => call.path.endsWith('/register'))).toHaveLength(1);
  });
}

test('Unicode: 11/12/128/129 символов, значения не обрезаются', async ({ page, loginServer }) => {
  loginServer.controls.registerError = 409;
  await page.goto(`${loginServer.url}/register`);
  const login = page.getByRole('textbox', { name: /^Логин/ });
  const password = page.getByLabel('Пароль', { exact: true });
  for (const [value, valid] of [['ab', false], ['abc', true], ['a'.repeat(32), true], ['a'.repeat(33), false], ['AZaz09_.-', true], ['агент', false]] as const) {
    const before = loginServer.calls.filter((call) => call.path.endsWith('/register')).length;
    await login.fill(value);
    await password.fill(' '.repeat(12));
    await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(valid ? 'Логин уже занят' : 'Проверьте поля');
    expect(loginServer.calls.filter((call) => call.path.endsWith('/register'))).toHaveLength(before + Number(valid));
  }
  for (const length of [11, 12, 128, 129]) {
    const before = loginServer.calls.filter((call) => call.path.endsWith('/register')).length;
    await login.fill('agent_demo');
    await password.fill('🏠'.repeat(length));
    await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(length === 12 || length === 128 ? 'Логин уже занят' : 'Проверьте поля');
    await expect(password).toHaveValue('🏠'.repeat(length));
    expect(loginServer.calls.filter((call) => call.path.endsWith('/register'))).toHaveLength(before + Number(length === 12 || length === 128));
  }
});

test('двойная отправка и поздний /me не отменяют регистрацию', async ({ page, loginServer }) => {
  let releaseMe!: () => void;
  let releaseRegister!: () => void;
  loginServer.controls.holdMe = new Promise((resolve) => { releaseMe = resolve; });
  loginServer.controls.holdRegister = new Promise((resolve) => { releaseRegister = resolve; });
  await page.goto(`${loginServer.url}/register`);
  await page.getByRole('textbox', { name: /^Логин/ }).fill('agent_demo');
  await page.getByLabel('Пароль', { exact: true }).fill('test password');
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).dblclick();
  await expect(page.getByRole('button', { name: 'Регистрируем…' })).toBeDisabled();
  await expect(page.getByRole('status')).toHaveText('Создаём аккаунт');
  await expect(page.getByRole('textbox', { name: /^Логин/ })).toBeDisabled();
  await expect(page.getByLabel('Пароль', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Показать пароль' })).toBeDisabled();
  expect(loginServer.calls.filter((call) => call.path.endsWith('/register'))).toHaveLength(1);
  releaseRegister();
  await expect(page.getByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
  releaseMe();
  await expect(page.getByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
});

test('первоначальный сбой /me не мешает регистрации', async ({ page, loginServer }) => {
  loginServer.controls.meError = 503;
  await page.goto(`${loginServer.url}/register`);
  await expect.poll(() => loginServer.calls.filter((call) => call.path.endsWith('/me')).length).toBe(1);
  await page.getByRole('textbox', { name: /^Логин/ }).fill('agent_demo');
  await page.getByLabel('Пароль', { exact: true }).fill('test password');
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
});
