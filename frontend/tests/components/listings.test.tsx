import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../../src/app/App';
import { navigate } from '../../src/app/navigation';
import { listing, listingDetails, listingItems } from '../fixtures/listings';

const user = { id: '9a07b31d-ac15-495c-bb91-e3756fe40bcc', login: 'agent_demo', role: 'agent' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
let me: () => Promise<Response>;
let page: () => Promise<Response>;
let detail: () => Promise<Response>;
let logout: () => Promise<Response>;
const fetchMock = vi.fn<typeof fetch>();
const calls = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/v1/listings?'));
const open = async (path = '/app') => {
  window.history.replaceState(null, '', path);
  render(<App />);
  await screen.findByRole('heading', { name: path === '/app' ? 'Мои объявления' : path === '/app/new' ? 'Новое объявление' : 'Объявление' });
};
const signOut = async () => {
  await userEvent.click(screen.getByRole('button', { name: /Меню пользователя/ }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Выйти' }));
};
beforeEach(() => {
  me = async () => json({ user });
  page = async () => json({ items: listingItems, nextCursor: null });
  detail = async () => json(listingDetails());
  logout = async () => new Response(null, { status: 204 });
  fetchMock.mockImplementation(async (url) => String(url).endsWith('/me') ? me() : String(url).endsWith('/logout') ? logout() : String(url).startsWith('/api/v1/listings/') ? detail() : page());
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset(); window.history.replaceState(null, '', '/'); });

test('список показывает API, четыре типа, сделки, null и независимые статусы', async () => {
  await open();
  const list = await screen.findByRole('list', { name: 'Мои объявления' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(5);
  expect(list).toHaveTextContent('Квартира · Продажа');
  expect(list).toHaveTextContent('Комната · Посуточная аренда');
  expect(list).toHaveTextContent('Дом · Продажа');
  expect(list).toHaveTextContent('Апартаменты · Длительная аренда');
  expect(list).toHaveTextContent('Тип объекта не указан · Тип сделки не указан');
  const failed = within(list).getAllByRole('listitem')[3]!;
  expect(failed).toHaveTextContent('Результат готов');
  expect(failed).toHaveTextContent('Последний запуск: ошибка');
  expect(await screen.findByText('Все объявления загружены')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Показать ещё' })).not.toBeInTheDocument();
});

test('первоначальная загрузка и пустой список с созданием без POST', async () => {
  let release!: (value: Response) => void;
  page = () => new Promise((resolve) => { release = resolve; });
  await open();
  expect(await screen.findByText('Загружаем объявления')).toBeVisible();
  await act(async () => release(json({ items: [], nextCursor: null })));
  expect(await screen.findByText('Пока нет объявлений')).toBeVisible();
  await userEvent.click(screen.getAllByRole('button', { name: 'Создать объявление' })[1]!);
  expect(await screen.findByRole('heading', { name: 'Новое объявление' })).toBeVisible();
  expect(fetchMock.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: '← Мои объявления' }));
  expect(window.location.pathname).toBe('/app');
});

for (const failure of ['network', 'server', 'invalid'] as const) {
  test(`ошибка ${failure} не выдаётся за пустой список, повтор доступен`, async () => {
    page = async () => { if (failure === 'network') throw new TypeError('Failed to fetch'); return failure === 'server' ? json({}, 503) : json({ items: 'bad' }); };
    await open();
    expect(await screen.findByRole('alert')).toHaveTextContent(failure === 'network' ? 'подключение' : failure === 'server' ? 'временно недоступен' : 'неожиданный ответ');
    expect(screen.queryByText('Пока нет объявлений')).not.toBeInTheDocument();
    page = async () => json({ items: listingItems, nextCursor: null });
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('list')).toBeVisible();
  });
}

test('непрозрачный курсор, несколько страниц, блокировка, дедупликация и серверный порядок', async () => {
  page = async () => json({ items: [listingItems[0], listingItems[0]], nextCursor: 'opaque+/=' });
  await open();
  const more = await screen.findByRole('button', { name: 'Показать ещё' });
  let release!: (value: Response) => void;
  page = () => new Promise((resolve) => { release = resolve; });
  fireEvent.click(more); fireEvent.click(more);
  expect(more).toBeDisabled();
  expect(calls()).toHaveLength(2);
  expect(new URL(String(calls()[1]![0]), 'http://localhost').searchParams.get('cursor')).toBe('opaque+/=');
  await act(async () => release(json({ items: [listingItems[0], listingItems[2], listingItems[1]], nextCursor: null })));
  const rows = screen.getAllByRole('listitem');
  expect(rows).toHaveLength(3);
  expect(rows[0]).toHaveTextContent('Лесной'); expect(rows[1]).toHaveTextContent('Ольги'); expect(rows[2]).toHaveTextContent('Новый черновик');
});

test('ошибка догрузки сохраняет строки и курсор для ручного повтора', async () => {
  page = async () => json({ items: [listing()], nextCursor: 'next' });
  await open();
  page = async () => json({}, 500);
  await userEvent.click(await screen.findByRole('button', { name: 'Показать ещё' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('следующую страницу');
  expect(screen.getByRole('list')).toHaveTextContent('Лесной');
  page = async () => json({ items: [listingItems[1]], nextCursor: null });
  await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
  expect(calls().slice(1).map(([url]) => String(url))).toEqual(['/api/v1/listings?limit=20&cursor=next', '/api/v1/listings?limit=20&cursor=next']);
});

test('зацикленный курсор даёт ошибку с сохранением строк', async () => {
  page = async () => json({ items: [listing()], nextCursor: 'loop' });
  await open();
  await userEvent.click(await screen.findByRole('button', { name: 'Показать ещё' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('неожиданный ответ');
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
});

test('пустая промежуточная страница не означает конец списка', async () => {
  page = async () => json({ items: [], nextCursor: 'next' });
  await open();
  expect(await screen.findByRole('button', { name: 'Показать ещё' })).toBeVisible();
  expect(screen.queryByText('Пока нет объявлений')).not.toBeInTheDocument();
});

for (const status of [401, 503, 200]) {
  test(`401 списка повторно проверяет сессию с ответом ${status}, без цикла`, async () => {
    await open();
    await screen.findByRole('list');
    me = async () => status === 200 ? json({ user }) : json({}, status);
    page = async () => json({}, 401);
    act(() => window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true })));
    if (status === 401) expect(await screen.findByRole('heading', { name: 'С возвращением' })).toBeVisible();
    else if (status === 503) expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось проверить сессию');
    else {
      expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось получить доступ');
      expect(calls().length).toBeGreaterThanOrEqual(2);
      expect(calls().length).toBeLessThanOrEqual(3);
      expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/me'))).toHaveLength(3);
    }
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
}

test('401 самого списка запускает /me и открывает вход при отсутствии сессии', async () => {
  let count = 0;
  me = async () => ++count === 1 ? json({ user }) : json({}, 401);
  page = async () => json({}, 401);
  await open();
  expect(await screen.findByRole('heading', { name: 'С возвращением' })).toBeVisible();
  expect(count).toBe(2);
});

test('запоздалый ответ после выхода и смены пользователя не возвращает чужие данные', async () => {
  let release!: (value: Response) => void;
  page = () => new Promise((resolve) => { release = resolve; });
  await open();
  await waitFor(() => expect(calls()).toHaveLength(1));
  await signOut();
  await screen.findByRole('heading', { name: 'С возвращением' });
  await act(async () => release(json({ items: listingItems, nextCursor: null })));
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
  me = async () => json({ user: { ...user, id: '9a07b31d-ac15-495c-bb91-e3756fe40bcd' } });
  page = async () => json({ items: [], nextCursor: null });
  act(() => { navigate('/app'); window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true })); });
  expect(await screen.findByText('Пока нет объявлений')).toBeVisible();
  expect(screen.queryByText(/Лесной проспект/)).not.toBeInTheDocument();
});

test('неудачный выход сохраняет сессию и показывает ошибку', async () => {
  await open(); await screen.findByRole('list');
  logout = async () => json({}, 503);
  await signOut();
  expect(await screen.findByText('Не удалось выйти')).toBeVisible();
  expect(await screen.findByRole('list')).toBeVisible();
  expect(window.location.pathname).toBe('/app');
});

test('карточка, повтор после 404, новый экран и History не требуют мутаций', async () => {
  await open();
  detail = async () => json({}, 404);
  await userEvent.click(await screen.findByRole('link', { name: /Лесной проспект/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('не найдено');
  detail = async () => json(listingDetails());
  await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  expect(await screen.findByText(/Здесь доступны основные данные/)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: '← Мои объявления' }));
  await userEvent.click(screen.getAllByRole('button', { name: 'Создать объявление' })[0]!);
  expect(await screen.findByRole('heading', { name: 'Новое объявление' })).toBeVisible();
  expect(fetchMock.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
  expect(() => navigate('/outside' as '/app')).toThrow();
});
