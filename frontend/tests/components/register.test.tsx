import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../../src/app/App';

const user = { id: '9a07b31d-ac15-495c-bb91-e3756fe40bcc', login: 'agent_demo', role: 'agent' };
const json = (value: unknown, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json', ...headers } });
const problem = (status: number, extra = {}, headers = {}) => json({ type: 'about:blank', title: 'Sensitive server diagnostic', status, code: 'FAILURE', requestId: 'a6cdd08a-a252-48fa-a6c5-73f485bc494e', ...extra }, status, headers);
const fetchMock = vi.fn<typeof fetch>();
const loginField = () => screen.getByRole('textbox', { name: /^Логин/ });
const passwordField = () => screen.getByLabelText(/^Пароль/);
const submit = () => screen.getByRole('button', { name: 'Зарегистрироваться' });
const calls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/register'));
async function openRegister(initial = problem(401)) {
  window.history.replaceState(null, '', '/register');
  fetchMock.mockResolvedValueOnce(initial);
  render(<App />);
  await screen.findByRole('heading', { name: 'Создать аккаунт' });
}
function fill(login = 'Agent_Demo', password = '  password 🏠  ') {
  fireEvent.change(loginField(), { target: { value: login } });
  fireEvent.change(passwordField(), { target: { value: password } });
}
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { window.history.replaceState(null, '', '/'); vi.unstubAllGlobals(); fetchMock.mockReset(); });

test('требования показаны заранее, пустые поля не отправляются, ошибки связаны с полями', async () => {
  await openRegister();
  expect(loginField()).toHaveAccessibleDescription(/3–32 символа/);
  expect(passwordField()).toHaveAccessibleDescription('От 12 до 128 символов');
  expect(loginField()).toHaveAttribute('autocomplete', 'username');
  expect(passwordField()).toHaveAttribute('autocomplete', 'new-password');
  await userEvent.click(submit());
  expect(calls()).toHaveLength(0);
  expect(loginField()).toHaveFocus();
  expect(loginField()).toHaveAccessibleDescription(/Введите логин/);
  expect(passwordField()).toHaveAccessibleDescription(/Введите пароль/);
  fill('abc', 'short');
  await userEvent.click(submit());
  expect(passwordField()).toHaveFocus();
  expect(calls()).toHaveLength(0);
  expect(screen.getByRole('alert')).toHaveTextContent('Проверьте поля');
});

test.each([
  ['ab', 'a'.repeat(12)], ['a'.repeat(33), 'a'.repeat(12)], ['агент', 'a'.repeat(12)],
  ['agent', '🏠'.repeat(11)], ['agent', '🏠'.repeat(129)],
])('неверные значения %s не вызывают POST', async (login, password) => {
  await openRegister();
  fill(login, password);
  await userEvent.click(submit());
  expect(calls()).toHaveLength(0);
  expect(screen.getByRole('alert')).toHaveTextContent('Проверьте поля');
});

test.each(['  password 🏠  ', ' '.repeat(12), 'е\u0301'.repeat(6), '🏠'.repeat(128)])('Enter передаёт исходный пароль %j и регистр логина, открывает кабинет', async (password) => {
  await openRegister();
  fetchMock.mockResolvedValueOnce(json({ user }, 201));
  fill('Agent_Demo', password);
  await userEvent.type(passwordField(), '{Enter}');
  expect(await screen.findByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
  expect(window.location.pathname).toBe('/app');
  expect(calls()).toHaveLength(1);
  expect(JSON.parse(String(calls()[0]?.[1]?.body))).toEqual({ login: 'Agent_Demo', password });
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/login'))).toHaveLength(0);
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  expect(window.location.href).not.toContain('password');
});

test('занятый логин определяется по 409 и допускает повтор после исправления', async () => {
  await openRegister();
  fetchMock.mockResolvedValueOnce(problem(409));
  fill();
  await userEvent.click(submit());
  expect(await screen.findByRole('alert')).toHaveTextContent('Логин уже занят');
  expect(loginField()).toHaveAccessibleDescription(/Этот логин уже занят/);
  expect(loginField()).toHaveFocus();
  expect(screen.queryByText(/Sensitive/)).not.toBeInTheDocument();
  expect(calls()).toHaveLength(1);
  fetchMock.mockResolvedValueOnce(json({ user }, 201));
  await userEvent.clear(loginField());
  await userEvent.type(loginField(), 'another_agent');
  await userEvent.click(submit());
  expect(await screen.findByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
  expect(calls()).toHaveLength(2);
});

test.each([
  [400, ['/login', '/password'], 'login'], [422, ['/password'], 'password'],
  [422, ['/unknown'], undefined], [400, [], undefined],
] as const)('ошибки %s связываются с известными полями и фокусируют первое неверное', async (status, fields, focused) => {
  await openRegister();
  fetchMock.mockResolvedValueOnce(problem(status, { fieldErrors: fields.map((field) => ({ field, code: 'INVALID', message: 'Sensitive field diagnostic' })) }));
  fill();
  await userEvent.click(submit());
  expect(await screen.findByRole('alert')).toHaveTextContent('Проверьте логин и пароль');
  if (fields.some((field) => field === '/login')) expect(loginField()).toHaveAccessibleDescription(/Проверьте логин/);
  if (fields.some((field) => field === '/password')) expect(passwordField()).toHaveAccessibleDescription(/Проверьте пароль/);
  if (focused) expect(focused === 'login' ? loginField() : passwordField()).toHaveFocus();
  expect(screen.queryByText(/Sensitive/)).not.toBeInTheDocument();
  expect(calls()).toHaveLength(1);
});

test.each([
  [429, { 'Retry-After': '30' }, 'Повторите через 30 с.'],
  [429, {}, 'Попробуйте позже'], [429, { 'Retry-After': '-1' }, 'Попробуйте позже'],
  [503, {}, 'Сервис временно недоступен'], [500, {}, 'Сервис временно недоступен'],
  [403, {}, 'Не удалось выполнить действие'],
])('ошибка %s безопасна, без автоматического POST', async (status, headers, message) => {
  await openRegister();
  fetchMock.mockResolvedValueOnce(problem(Number(status), {}, headers));
  fill();
  await userEvent.click(submit());
  expect(await screen.findByRole('alert')).toHaveTextContent(String(message));
  expect(screen.queryByText(/Sensitive/)).not.toBeInTheDocument();
  expect(calls()).toHaveLength(1);
  expect(submit()).toBeEnabled();
  expect(window.location.pathname).toBe('/register');
});

test.each(['network', 'invalid', 'wrong-status', 'broken-json'] as const)('сбой %s оставляет ручной повтор', async (kind) => {
  await openRegister();
  if (kind === 'network') fetchMock.mockRejectedValueOnce(new TypeError('Sensitive network diagnostic'));
  else if (kind === 'broken-json') fetchMock.mockResolvedValueOnce(new Response('{', { status: 201, headers: { 'Content-Type': 'application/json' } }));
  else fetchMock.mockResolvedValueOnce(json(kind === 'invalid' ? {} : { user }, kind === 'wrong-status' ? 200 : 201));
  fill();
  await userEvent.click(submit());
  expect(await screen.findByRole('alert')).toHaveTextContent(kind === 'network' ? 'Нет связи с сервером' : 'Не удалось получить ответ');
  expect(calls()).toHaveLength(1);
  expect(screen.queryByText(/Sensitive/)).not.toBeInTheDocument();
  fetchMock.mockResolvedValueOnce(json({ user }, 201));
  await userEvent.click(submit());
  expect(await screen.findByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
});

test('показ и скрытие пароля работают с клавиатуры', async () => {
  await openRegister();
  fill();
  screen.getByRole('button', { name: 'Показать пароль' }).focus();
  await userEvent.keyboard(' ');
  expect(passwordField()).toHaveAttribute('type', 'text');
  expect(passwordField()).toHaveValue('  password 🏠  ');
  expect(screen.getByRole('button', { name: 'Скрыть пароль' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.keyboard(' ');
  expect(passwordField()).toHaveAttribute('type', 'password');
  expect(calls()).toHaveLength(0);
});

test('два submit в одном событии создают один запрос и объявляют загрузку', async () => {
  await openRegister();
  let release!: (value: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
  fill();
  const form = screen.getByRole('form', { name: 'Регистрация аккаунта' });
  act(() => { fireEvent.submit(form); fireEvent.submit(form); });
  expect(calls()).toHaveLength(1);
  expect(form).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('status')).toHaveTextContent('Создаём аккаунт');
  expect(loginField()).toBeDisabled();
  expect(passwordField()).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Показать пароль' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Регистрируем…' })).toBeDisabled();
  await act(async () => { release(json({ user }, 201)); });
  expect(await screen.findByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
});

test('сбой первоначального /me не мешает регистрации', async () => {
  await openRegister(problem(503));
  fetchMock.mockResolvedValueOnce(json({ user }, 201));
  fill();
  await userEvent.click(submit());
  expect(await screen.findByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
});

test('поздний /me не отменяет зарегистрированную сессию', async () => {
  let release!: (value: Response) => void;
  window.history.replaceState(null, '', '/register');
  fetchMock.mockReturnValueOnce(new Promise((resolve) => { release = resolve; })).mockResolvedValueOnce(json({ user }, 201));
  render(<App />);
  await screen.findByRole('heading', { name: 'Создать аккаунт' });
  fill();
  await userEvent.click(submit());
  await screen.findByRole('heading', { name: 'Личный кабинет' });
  await act(async () => { release(problem(401)); });
  expect(screen.getByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
});

test('авторизованный пользователь перенаправляется из /register в /app', async () => {
  window.history.replaceState(null, '', '/register');
  fetchMock.mockResolvedValueOnce(json({ user }));
  render(<App />);
  await waitFor(() => expect(window.location.pathname).toBe('/app'));
  expect(await screen.findByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
  expect(calls()).toHaveLength(0);
});
