import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../../src/app/App';
import { navigate } from '../../src/app/navigation';

const user = { id: '9a07b31d-ac15-495c-bb91-e3756fe40bcc', login: 'agent_demo', role: 'agent' };
const json = (value: unknown, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json', ...headers } });
const problem = (status: number, code = 'FAILURE', extra = {}) => json({ type: 'about:blank', title: 'Sensitive technical diagnostic', status, code, requestId: 'a6cdd08a-a252-48fa-a6c5-73f485bc494e', ...extra }, status, status === 429 ? { 'Retry-After': '30' } : {});
const fetchMock = vi.fn<typeof fetch>();
const loginField = () => screen.getByRole('textbox', { name: /^Логин/ });
const passwordField = () => screen.getByLabelText(/^Пароль/);
const loginCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/login'));
async function openLogin(initial = problem(401)) {
  window.history.replaceState(null, '', '/login');
  fetchMock.mockResolvedValueOnce(initial);
  render(<App />);
  await screen.findByRole('heading', { name: 'С возвращением' });
}
async function fill(login = 'a', password = 'x') {
  await userEvent.type(loginField(), login);
  await userEvent.type(passwordField(), password);
}
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { window.history.replaceState(null, '', '/'); vi.unstubAllGlobals(); fetchMock.mockReset(); });

test('пустые поля не отправляют запрос, ошибка подписана, фокус на первом поле', async () => {
  await openLogin();
  await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
  expect(loginCalls()).toHaveLength(0);
  expect(loginField()).toHaveFocus();
  expect(loginField()).toHaveAccessibleDescription('Введите логин');
  expect(passwordField()).toHaveAccessibleDescription('Введите пароль');
  await userEvent.type(loginField(), 'a');
  await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
  expect(passwordField()).toHaveFocus();
  expect(loginCalls()).toHaveLength(0);
});

test('Enter отправляет исходный пароль и короткий логин без ограничений регистрации', async () => {
  await openLogin();
  fetchMock.mockResolvedValueOnce(json({ user }));
  await fill('a', '  x  ');
  expect(loginField()).toHaveAttribute('autocomplete', 'username');
  expect(passwordField()).toHaveAttribute('autocomplete', 'current-password');
  await userEvent.type(passwordField(), '{Enter}');
  expect(await screen.findByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
  expect(window.location.pathname).toBe('/app');
  expect(loginCalls()).toHaveLength(1);
  expect(JSON.parse(String(loginCalls()[0]?.[1]?.body))).toEqual({ login: 'a', password: '  x  ' });
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});

test('пробелы в пароле передаются без trim, пробельный логин не принимается', async () => {
  await openLogin();
  fetchMock.mockResolvedValueOnce(problem(401, 'INVALID_CREDENTIALS'));
  await fill('   ', ' ');
  await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
  expect(loginCalls()).toHaveLength(0);
  await userEvent.clear(loginField());
  await userEvent.type(loginField(), 'a');
  await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Неверный логин или пароль');
  expect(JSON.parse(String(loginCalls()[0]?.[1]?.body)).password).toBe(' ');
});

test('показ пароля доступен с клавиатуры и сохраняет значение', async () => {
  await openLogin();
  await fill();
  const toggle = screen.getByRole('button', { name: 'Показать пароль' });
  toggle.focus();
  await userEvent.keyboard(' ');
  expect(passwordField()).toHaveAttribute('type', 'text');
  expect(passwordField()).toHaveValue('x');
  expect(screen.getByRole('button', { name: 'Скрыть пароль' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.keyboard(' ');
  expect(passwordField()).toHaveAttribute('type', 'password');
  expect(loginCalls()).toHaveLength(0);
});

test.each([
  [401, 'INVALID_CREDENTIALS', 'Неверный логин или пароль'],
  [429, 'RATE_LIMITED', 'Повторите через 30 с.'],
  [503, 'SERVICE_UNAVAILABLE', 'Сервис временно недоступен'],
  [400, 'VALIDATION_ERROR', 'Проверьте логин и пароль'],
  [403, 'FORBIDDEN', 'Не удалось выполнить действие'],
] as const)('ошибка %s понятна и не раскрывает диагностику', async (status, code, message) => {
  await openLogin();
  fetchMock.mockResolvedValueOnce(problem(status, code));
  await fill();
  await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(screen.queryByText(/Sensitive/)).not.toBeInTheDocument();
  expect(window.location.pathname).toBe('/login');
  expect(loginCalls()).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Войти' })).toBeEnabled();
});

test.each(['network', 'invalid'] as const)('ошибка %s позволяет повторить вход вручную', async (kind) => {
  await openLogin();
  if (kind === 'network') fetchMock.mockRejectedValueOnce(new TypeError('private diagnostic'));
  else fetchMock.mockResolvedValueOnce(json({}));
  await fill();
  await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(kind === 'network' ? 'Нет связи с сервером' : 'Не удалось получить ответ');
  expect(loginCalls()).toHaveLength(1);
  fetchMock.mockResolvedValueOnce(json({ user }));
  await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
  expect(await screen.findByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
  expect(loginCalls()).toHaveLength(2);
});

test('серверные ошибки полей связаны с полями, технический текст скрыт', async () => {
  await openLogin();
  fetchMock.mockResolvedValueOnce(problem(422, 'VALIDATION_ERROR', { fieldErrors: [
    { field: '/login', code: 'INVALID', message: 'Secret login diagnostic' },
    { field: '/password', code: 'INVALID', message: 'Secret password diagnostic' },
    { field: '/unknown', code: 'INVALID', message: 'Secret diagnostic' },
  ] }));
  await fill();
  await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
  await screen.findByRole('alert');
  expect(loginField()).toHaveAccessibleDescription('Проверьте логин');
  expect(passwordField()).toHaveAccessibleDescription('Проверьте пароль');
  expect(screen.queryByText(/Secret/)).not.toBeInTheDocument();
});

test('двойной submit блокируется синхронно, поля и показ пароля заблокированы', async () => {
  await openLogin();
  let release!: (response: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
  await fill();
  const form = screen.getByRole('form', { name: 'Вход в аккаунт' });
  act(() => { fireEvent.submit(form); fireEvent.submit(form); });
  expect(loginCalls()).toHaveLength(1);
  expect(loginField()).toBeDisabled();
  expect(passwordField()).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Показать пароль' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Входим…' })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Проверяем логин и пароль');
  await act(async () => { release(json({ user })); });
  expect(await screen.findByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
});

test('неудачная первоначальная проверка сессии не блокирует вход', async () => {
  await openLogin(problem(503));
  fetchMock.mockResolvedValueOnce(json({ user }));
  await fill();
  await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
  expect(await screen.findByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
});

test('поздний /me не отменяет вход через форму', async () => {
  let release!: (response: Response) => void;
  window.history.replaceState(null, '', '/login');
  fetchMock.mockReturnValueOnce(new Promise((resolve) => { release = resolve; })).mockResolvedValueOnce(json({ user }));
  render(<App />);
  await screen.findByRole('heading', { name: 'С возвращением' });
  await fill();
  await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
  await screen.findByRole('heading', { name: 'Личный кабинет' });
  await act(async () => { release(problem(401)); });
  expect(screen.getByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
});

test('прямой защищённый адрес не показывает кабинет гостю', async () => {
  window.history.replaceState(null, '', '/app');
  let release!: (response: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
  render(<App />);
  expect(screen.queryByText('Личный кабинет')).not.toBeInTheDocument();
  await act(async () => { release(problem(401)); });
  expect(await screen.findByRole('heading', { name: 'С возвращением' })).toBeVisible();
  expect(window.location.pathname).toBe('/login');
});

test('восстановленная сессия открывает кабинет, выход с ошибкой сохраняет пользователя', async () => {
  window.history.replaceState(null, '', '/app');
  fetchMock.mockResolvedValueOnce(json({ user })).mockResolvedValueOnce(problem(503));
  render(<App />);
  await screen.findByRole('heading', { name: 'Личный кабинет' });
  await userEvent.click(screen.getByRole('button', { name: 'Выйти' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выйти');
  expect(screen.getByText('agent_demo', { selector: 'strong' })).toBeVisible();
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
  await userEvent.click(screen.getByRole('button', { name: 'Выйти' }));
  expect(await screen.findByRole('heading', { name: 'С возвращением' })).toBeVisible();
  expect(window.location.pathname).toBe('/login');
});

test('ошибка проверки защищённой страницы даёт повтор и путь ко входу', async () => {
  window.history.replaceState(null, '', '/app');
  fetchMock.mockResolvedValueOnce(problem(503));
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось проверить сессию');
  expect(screen.getByRole('link', { name: 'Войти в аккаунт' })).toHaveAttribute('href', '/login');
  expect(screen.queryByText('Личный кабинет')).not.toBeInTheDocument();
});

test('главная открывает кабинет авторизованному пользователю', async () => {
  window.history.replaceState(null, '', '/');
  fetchMock.mockResolvedValueOnce(json({ user }));
  render(<App />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  await userEvent.click(screen.getAllByRole('button', { name: 'Начать работу' })[0]!);
  expect(await screen.findByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
  act(() => { navigate('/app'); navigate('/app'); });
  expect(window.location.pathname).toBe('/app');
});

test('неизвестный адрес предлагает главную, внешние returnTo игнорируются', async () => {
  window.history.replaceState(null, '', '/missing');
  fetchMock.mockResolvedValueOnce(problem(401));
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/');
  act(() => { navigate('/login'); });
  await screen.findByRole('heading', { name: 'С возвращением' });
});
