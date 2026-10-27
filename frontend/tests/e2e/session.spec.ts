import { test as base, expect } from './fixtures';
import { startSessionServer } from './session-server';
import { openUIFixture } from './ui-fixture';

const user = { id: '9a07b31d-ac15-495c-bb91-e3756fe40bcc', login: 'agent_demo', role: 'agent' };
const problem = (status: number, code: string) => ({
  type: 'about:blank', title: code === 'INVALID_CREDENTIALS' ? 'Неверный логин или пароль' : 'Не удалось выполнить запрос',
  status, code, requestId: 'a6cdd08a-a252-48fa-a6c5-73f485bc494e',
});

const test = base.extend<{ sessionServer: Awaited<ReturnType<typeof startSessionServer>> }>({
  sessionServer: async ({ page }, provide) => {
    const server = await startSessionServer();
    try { await provide(server); } finally { await page.goto('about:blank'); await server.close(); }
  },
});

test('cookie-сессия: вход, восстановление, ошибка входа, неудачный и успешный выход', async ({ page, context, sessionServer }) => {
  const { calls, controls } = sessionServer;
  await page.goto(`${sessionServer.url}/__ui/index.html?session`);
  await expect(page.getByTestId('session-state')).toHaveText('anonymous');
  await expect(page.getByText('Объявления пользователя')).toHaveCount(0);
  await page.getByRole('button', { name: 'Вход', exact: true }).click();
  await expect(page.getByTestId('session-state')).toHaveText('authenticated');
  await expect(page.getByText('Объявления пользователя')).toBeVisible();
  await expect(page.getByText('Каналы администратора')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Администрирование' })).toHaveText(/Недостаточно прав/);
  const cookies = await context.cookies();
  expect(cookies.find((cookie) => cookie.name === 'session')).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/api/v1' });
  expect(await page.evaluate(() => document.cookie)).not.toContain('session=');
  await page.getByRole('button', { name: 'Проверить сессию' }).click();
  await expect(page.getByTestId('session-state')).toHaveText('authenticated');
  expect(calls.filter((call) => call.path.endsWith('/me')).at(-1)?.cookie).toContain('session=test-session');
  const login = calls.find((call) => call.path.endsWith('/login'));
  expect(login).toMatchObject({ method: 'POST', body: { login: 'agent_demo', password: '  test password  ' }, origin: new URL(page.url()).origin });
  controls.failLogin = true;
  await page.getByRole('button', { name: 'Вход', exact: true }).click();
  await expect(page.getByTestId('action-error')).toHaveText('Неверный логин или пароль');
  await expect(page.getByTestId('session-state')).toHaveText('authenticated');
  controls.failLogout = true;
  await page.getByRole('button', { name: 'Выход', exact: true }).click();
  await expect(page.getByTestId('action-error')).toHaveText(/Сервис временно недоступен/);
  await expect(page.getByText('Объявления пользователя')).toBeVisible();
  expect(calls.filter((call) => call.path.endsWith('/logout'))).toHaveLength(1);
  controls.failLogout = false;
  await page.getByRole('button', { name: 'Выход', exact: true }).click();
  await expect(page.getByTestId('session-state')).toHaveText('anonymous');
  expect((await context.cookies()).some((cookie) => cookie.name === 'session')).toBe(false);
});

test('регистрация сразу открывает сессию агента, перезагрузка восстанавливает её', async ({ page, sessionServer }) => {
  await page.goto(`${sessionServer.url}/__ui/index.html?session`);
  await expect(page.getByTestId('session-state')).toHaveText('anonymous');
  await page.getByRole('button', { name: 'Регистрация', exact: true }).click();
  await expect(page.getByText('Объявления пользователя')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('session-state')).toHaveText('authenticated');
  await expect(page.getByText('Объявления пользователя')).toBeVisible();
  await expect(page.getByText('Каналы администратора')).toHaveCount(0);
});

test('проверка сессии показывает ожидание и ошибку сервера, повтор восстанавливает доступ', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let attempt = 0;
  await page.route('**/api/v1/auth/me', async (route) => {
    attempt += 1;
    if (attempt === 1) await pending;
    await route.fulfill({ status: attempt === 1 ? 503 : 200, contentType: attempt === 1 ? 'application/problem+json' : 'application/json',
      body: JSON.stringify(attempt === 1 ? problem(503, 'SERVICE_UNAVAILABLE') : { user }) });
  });
  await openUIFixture(page, 'session');
  await expect(page.getByTestId('session-state')).toHaveText('checking');
  await expect(page.getByText('Объявления пользователя')).toHaveCount(0);
  release();
  await expect(page.getByTestId('session-state')).toHaveText('error');
  await expect(page.getByRole('region', { name: 'Личный кабинет' }).getByRole('alert')).toHaveText(/Не удалось проверить сессию/);
  await page.getByRole('region', { name: 'Личный кабинет' }).getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByText('Объявления пользователя')).toBeVisible();
});

test('публичная главная доступна при сетевом сбое API', async ({ page }) => {
  await page.route('**/api/v1/**', (route) => route.abort('internetdisconnected'));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Поможем рассказать о доме главное');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('существующая сессия администратора открывает защищённый раздел', async ({ page, context, sessionServer }) => {
  await context.addCookies([{
    name: 'session', value: 'test-session', domain: new URL(sessionServer.url).hostname,
    path: '/api/v1', httpOnly: true, sameSite: 'Lax',
  }]);
  sessionServer.controls.role = 'admin';
  await page.goto(`${sessionServer.url}/__ui/index.html?session`);
  await expect(page.getByText('Каналы администратора')).toBeVisible();
});
