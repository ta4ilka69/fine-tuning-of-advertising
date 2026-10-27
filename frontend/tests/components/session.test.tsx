import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../../src/app/App';
import { AppProvider } from '../../src/app/AppProvider';
import { SessionGuard } from '../../src/features/session/SessionGuard';
import { SessionProvider } from '../../src/features/session/SessionProvider';
import { useSession } from '../../src/features/session/context';

const user = { id: '9a07b31d-ac15-495c-bb91-e3756fe40bcc', login: 'agent_demo', role: 'agent' };
const admin = { ...user, login: 'admin_demo', role: 'admin' };
const credentials = { login: 'agent_demo', password: '  пароль без изменений  ' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
});
const failure = (status: number, code = 'UNAUTHENTICATED') => json({
  type: 'about:blank', title: 'Не удалось выполнить действие', status, code,
  requestId: 'a6cdd08a-a252-48fa-a6c5-73f485bc494e',
}, status);
const fetchMock = vi.fn<typeof fetch>();
function wrapper({ children }: { children: ReactNode }) {
  return <AppProvider><SessionProvider>{children}</SessionProvider></AppProvider>;
}
function deferred() {
  let resolve!: (response: Response) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Response>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => { vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset(); });

test('useSession сообщает об отсутствующем провайдере', () => {
  expect(() => renderHook(useSession)).toThrow('Для useSession нужен SessionProvider');
});

test('восстановление не показывает защищённое содержимое до ответа', async () => {
  const initial = deferred();
  fetchMock.mockReturnValue(initial.promise);
  render(<SessionGuard><p>Секрет</p></SessionGuard>, { wrapper });
  expect(screen.getByText('Проверяем сессию')).toBeVisible();
  expect(screen.queryByText('Секрет')).not.toBeInTheDocument();
  await act(async () => { initial.resolve(json({ user })); });
  expect(await screen.findByText('Секрет')).toBeVisible();
  expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/auth/me');
});

test('401 при восстановлении означает отсутствие сессии', async () => {
  fetchMock.mockResolvedValue(failure(401));
  const { result } = renderHook(useSession, { wrapper });
  await waitFor(() => expect(result.current.state).toEqual({ status: 'anonymous' }));
});

test.each([500, 501, 503, 'network', 'invalid', 'unknown'] as const)('сбой восстановления %s остаётся ошибкой, а не выходом', async (status) => {
  if (status === 'network') fetchMock.mockRejectedValue(new TypeError('offline'));
  else if (status === 'invalid') fetchMock.mockResolvedValue(json({}));
  else if (status === 'unknown') fetchMock.mockImplementation(() => { throw 'unknown'; });
  else fetchMock.mockResolvedValue(failure(status));
  render(<SessionGuard><p>Секрет</p></SessionGuard>, { wrapper });
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось проверить сессию');
  expect(screen.queryByText('Войдите в аккаунт')).not.toBeInTheDocument();
  expect(screen.queryByText('Секрет')).not.toBeInTheDocument();
});

test('повтор проверки восстанавливает доступ после ошибки', async () => {
  fetchMock.mockResolvedValueOnce(failure(503)).mockResolvedValueOnce(json({ user }));
  render(<SessionGuard><p>Секрет</p></SessionGuard>, { wrapper });
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  expect(await screen.findByText('Секрет')).toBeVisible();
});

test.each(['login', 'register'] as const)('%s открывает полученную сессию', async (method) => {
  fetchMock.mockResolvedValueOnce(failure(401)).mockResolvedValueOnce(json({ user }, method === 'register' ? 201 : 200));
  const { result } = renderHook(useSession, { wrapper });
  await waitFor(() => expect(result.current.state.status).toBe('anonymous'));
  await act(async () => { await result.current[method](credentials); });
  expect(result.current.state).toEqual({ status: 'authenticated', user });
  expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/v1/auth/${method}`);
  expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(JSON.stringify(credentials));
});

test('успешный выход очищает пользователя только после ответа 204', async () => {
  const logout = deferred();
  fetchMock.mockResolvedValueOnce(json({ user })).mockReturnValueOnce(logout.promise);
  const { result } = renderHook(useSession, { wrapper });
  await waitFor(() => expect(result.current.state.status).toBe('authenticated'));
  let operation!: Promise<void>;
  act(() => { operation = result.current.logout(); });
  expect(result.current.state).toEqual({ status: 'authenticated', user });
  await act(async () => { logout.resolve(new Response(null, { status: 204 })); await operation; });
  expect(result.current.state).toEqual({ status: 'anonymous' });
});

test.each([403, 500, 'network'] as const)('ошибка выхода %s не подтверждает завершение сессии', async (status) => {
  fetchMock.mockResolvedValueOnce(json({ user }));
  if (status === 'network') fetchMock.mockRejectedValueOnce(new TypeError('offline'));
  else fetchMock.mockResolvedValueOnce(failure(status));
  const { result } = renderHook(useSession, { wrapper });
  await waitFor(() => expect(result.current.state.status).toBe('authenticated'));
  await act(async () => { await expect(result.current.logout()).rejects.toMatchObject({ kind: status === 'network' ? 'network' : 'http' }); });
  expect(result.current.state).toEqual({ status: 'authenticated', user });
});

test.each([401, 403])('ошибка входа %s остаётся у вызывающей формы и сохраняет текущего пользователя', async (status) => {
  fetchMock.mockResolvedValueOnce(json({ user })).mockResolvedValueOnce(failure(status, status === 401 ? 'INVALID_CREDENTIALS' : 'FORBIDDEN'));
  const { result } = renderHook(useSession, { wrapper });
  await waitFor(() => expect(result.current.state.status).toBe('authenticated'));
  await act(async () => { await expect(result.current.login(credentials)).rejects.toMatchObject({ status }); });
  expect(result.current.state).toEqual({ status: 'authenticated', user });
});

test('неверный вход из гостевого состояния не меняет состояние сессии', async () => {
  fetchMock.mockResolvedValueOnce(failure(401)).mockResolvedValueOnce(failure(401, 'INVALID_CREDENTIALS'));
  const { result } = renderHook(useSession, { wrapper });
  await waitFor(() => expect(result.current.state.status).toBe('anonymous'));
  await act(async () => { await expect(result.current.login(credentials)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' }); });
  expect(result.current.state).toEqual({ status: 'anonymous' });
});

test.each([
  ['anonymous', false, 'Войдите в аккаунт'],
  ['agent', true, 'Недостаточно прав'],
  ['agent', false, 'Секрет'],
  ['admin', true, 'Секрет'],
] as const)('защита: %s, администратор нужен: %s', async (identity, requiredAdmin, expected) => {
  fetchMock.mockResolvedValue(identity === 'anonymous' ? failure(401) : json({ user: identity === 'admin' ? admin : user }));
  render(<SessionGuard role={requiredAdmin ? 'admin' : undefined}><p>Секрет</p></SessionGuard>, { wrapper });
  expect(await screen.findByText(expected)).toBeVisible();
  if (expected !== 'Секрет') expect(screen.queryByText('Секрет')).not.toBeInTheDocument();
});

test.each(['logout', 'login', 'register'] as const)('запоздалый /me не отменяет %s, даже если транспорт проигнорировал abort', async (method) => {
  const initial = deferred();
  fetchMock.mockReturnValueOnce(initial.promise).mockResolvedValueOnce(method === 'logout'
    ? new Response(null, { status: 204 }) : json({ user: admin }, method === 'register' ? 201 : 200));
  const { result } = renderHook(useSession, { wrapper });
  expect(result.current.state.status).toBe('checking');
  await act(async () => { await (method === 'logout' ? result.current.logout() : result.current[method](credentials)); });
  const expected = method === 'logout' ? { status: 'anonymous' } : { status: 'authenticated', user: admin };
  expect(result.current.state).toEqual(expected);
  expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  await act(async () => { initial.resolve(json({ user })); });
  expect(result.current.state).toEqual(expected);
});

test('ошибка устаревшего /me не скрывает новую сессию', async () => {
  const initial = deferred();
  fetchMock.mockReturnValueOnce(initial.promise).mockResolvedValueOnce(json({ user }));
  const { result } = renderHook(useSession, { wrapper });
  await act(async () => { await result.current.login(credentials); });
  await act(async () => { initial.reject(new TypeError('offline')); });
  expect(result.current.state).toEqual({ status: 'authenticated', user });
});

test('параллельные изменения cookie-сессии запрещены, проверка не вмешивается во вход', async () => {
  const login = deferred();
  fetchMock.mockResolvedValueOnce(failure(401)).mockReturnValueOnce(login.promise);
  const { result } = renderHook(useSession, { wrapper });
  await waitFor(() => expect(result.current.state.status).toBe('anonymous'));
  let operation!: Promise<void>;
  act(() => { operation = result.current.login(credentials); });
  await expect(result.current.logout()).rejects.toThrow('Изменение сессии уже выполняется');
  await act(async () => { await result.current.restore(); });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await act(async () => { login.resolve(json({ user })); await operation; });
  expect(result.current.state).toEqual({ status: 'authenticated', user });
});

test('ошибка изменения сессии во время первоначальной проверки не оставляет бесконечную загрузку', async () => {
  fetchMock.mockReturnValueOnce(deferred().promise).mockResolvedValueOnce(failure(503)).mockResolvedValueOnce(failure(500));
  const { result } = renderHook(useSession, { wrapper });
  await act(async () => { await expect(result.current.logout()).rejects.toMatchObject({ status: 503 }); });
  await waitFor(() => expect(result.current.state).toMatchObject({ status: 'error', error: { status: 500 } }));
});

test('StrictMode и повторная проверка игнорируют старые ответы', async () => {
  const stale: ReturnType<typeof deferred>[] = [];
  fetchMock.mockImplementation(() => {
    const pending = deferred();
    stale.push(pending);
    return pending.promise;
  });
  const { result } = renderHook(useSession, {
    wrapper: ({ children }) => <StrictMode><SessionProvider>{children}</SessionProvider></StrictMode>,
  });
  fetchMock.mockResolvedValueOnce(json({ user: admin }));
  await act(async () => { await result.current.restore(); });
  await act(async () => { for (const pending of stale) pending.resolve(json({ user })); });
  expect(result.current.state).toEqual({ status: 'authenticated', user: admin });
});

test('размонтирование отменяет восстановление', () => {
  fetchMock.mockReturnValue(deferred().promise);
  const { unmount } = renderHook(useSession, { wrapper });
  const signal = fetchMock.mock.calls[0]?.[1]?.signal;
  unmount();
  expect(signal?.aborted).toBe(true);
});

test('главная остаётся доступна при недоступном API', async () => {
  fetchMock.mockRejectedValue(new TypeError('offline'));
  render(<App />);
  expect(screen.getByRole('main')).toBeVisible();
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(screen.queryByText('Не удалось проверить сессию')).not.toBeInTheDocument();
});

test('неверный вход до завершения /me возвращает ошибку форме и заново проверяет действующую сессию', async () => {
  const initial = deferred();
  fetchMock.mockReturnValueOnce(initial.promise)
    .mockResolvedValueOnce(failure(401, 'INVALID_CREDENTIALS')).mockResolvedValueOnce(json({ user }));
  const { result } = renderHook(useSession, { wrapper });
  await act(async () => { await expect(result.current.login(credentials)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' }); });
  await waitFor(() => expect(result.current.state).toEqual({ status: 'authenticated', user }));
  await act(async () => { initial.resolve(failure(401)); });
  expect(result.current.state).toEqual({ status: 'authenticated', user });
});

test('возврат из BFCache скрывает старого пользователя до новой проверки сессии', async () => {
  const restored = deferred();
  fetchMock.mockResolvedValueOnce(json({ user })).mockReturnValueOnce(restored.promise);
  render(<SessionGuard><p>Секрет</p></SessionGuard>, { wrapper });
  expect(await screen.findByText('Секрет')).toBeVisible();
  act(() => { window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false })); });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  act(() => { window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
  expect(screen.queryByText('Секрет')).not.toBeInTheDocument();
  expect(screen.getByText('Проверяем сессию')).toBeVisible();
  await act(async () => { restored.resolve(failure(401)); });
  expect(await screen.findByText('Войдите в аккаунт')).toBeVisible();
  expect(screen.queryByText('Секрет')).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('ошибка проверки после BFCache не возвращает старое защищённое содержимое', async () => {
  fetchMock.mockResolvedValueOnce(json({ user })).mockRejectedValueOnce(new TypeError('offline'));
  render(<SessionGuard><p>Секрет</p></SessionGuard>, { wrapper });
  await screen.findByText('Секрет');
  act(() => { window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось проверить сессию');
  expect(screen.queryByText('Секрет')).not.toBeInTheDocument();
});
