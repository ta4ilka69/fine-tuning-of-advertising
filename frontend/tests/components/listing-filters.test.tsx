import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AppProvider } from '../../src/app/AppProvider';
import { ListingList } from '../../src/pages/account/ListingList';
import { listing, listingItems } from '../fixtures/listings';

const fetchMock = vi.fn<typeof fetch>();
const json = (items: unknown = [listing()], nextCursor: string | null = null) => new Response(JSON.stringify({ items, nextCursor }), { headers: { 'Content-Type': 'application/json' } });
const query = (index = fetchMock.mock.calls.length - 1) => new URL(String(fetchMock.mock.calls[index]![0]), 'http://localhost').searchParams;
const open = (search = '') => {
  window.history.replaceState(null, '', `/app${search}`);
  render(<AppProvider><ListingList recheck={vi.fn()} /></AppProvider>);
};
const enter = () => fireEvent.submit(screen.getByRole('form', { name: 'Поиск и фильтры объявлений' }));
beforeEach(() => { fetchMock.mockImplementation(async () => json()); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); fetchMock.mockReset(); window.history.replaceState(null, '', '/'); });

test('debounce, Enter, пустой q и отсутствие истории на каждый символ', async () => {
  open(); await screen.findByRole('list');
  vi.useFakeTimers();
  const length = window.history.length;
  const input = screen.getByLabelText('Поиск по адресу');
  fireEvent.change(input, { target: { value: 'Л' } });
  await act(() => vi.advanceTimersByTimeAsync(200));
  fireEvent.change(input, { target: { value: 'Лес' } });
  await act(() => vi.advanceTimersByTimeAsync(299));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(query().get('q')).toBe('Лес');
  expect(window.history.length).toBe(length + 1);
  fireEvent.change(input, { target: { value: 'Дом' } }); enter();
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(query().get('q')).toBe('Дом');
  fireEvent.change(input, { target: { value: '   ' } }); enter();
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(query().has('q')).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

test('даты вместе с q, валидация, односторонние периоды и сброс', async () => {
  open('?q=Лес&from=2026-12-31&to=2026-12-31'); await screen.findByRole('list');
  expect(query().get('limit')).toBe('20');
  expect(new Date(query().get('to')!).getDate()).toBe(1);
  fireEvent.change(screen.getByLabelText('Дата создания: с'), { target: { value: '2027-01-02' } });
  expect(screen.getByRole('alert')).toHaveTextContent('позже конца'); enter();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('Дата создания: по'), { target: { value: '' } });
  await screen.findByRole('list'); expect(query().has('to')).toBe(false); expect(query().get('q')).toBe('Лес');
  fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
  await screen.findByRole('list'); expect([...query().keys()]).toEqual(['limit']);
  expect(window.location.search).toBe('');
});

for (const late of ['success', 'error', '401'] as const) {
  test(`смена фильтра отменяет запрос, поздний ${late} не меняет выдачу`, async () => {
    let release!: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    open(); await screen.findByText('Загружаем объявления');
    const signal = fetchMock.mock.calls[0]![1]!.signal!;
    fetchMock.mockImplementation(async () => json([listingItems[1]]));
    fireEvent.change(screen.getByLabelText('Поиск по адресу'), { target: { value: 'новый' } }); enter();
    expect(signal.aborted).toBe(true);
    await screen.findByRole('list');
    await act(async () => release(late === 'success' ? json() : new Response('{}', { status: late === '401' ? 401 : 503 })));
    expect(screen.getByRole('list')).toHaveTextContent('Новый черновик');
    expect(screen.queryByText(/Лесной проспект/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
}

test('смена фильтров сбрасывает страницы и историю курсоров, повтор сохраняет набор', async () => {
  fetchMock.mockImplementation(async () => json([listingItems[0]], 'same'));
  open('?q=первый'); await screen.findByRole('list');
  fetchMock.mockImplementation(async () => json([listingItems[1]], 'next'));
  fireEvent.click(screen.getByRole('button', { name: 'Показать ещё' }));
  await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
  fetchMock.mockImplementation(async () => json([listingItems[2]], 'same'));
  fireEvent.change(screen.getByLabelText('Поиск по адресу'), { target: { value: 'второй' } }); enter();
  await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
  expect(query().has('cursor')).toBe(false);
  fetchMock.mockImplementation(async () => new Response('{}', { status: 503 }));
  fireEvent.click(screen.getByRole('button', { name: 'Показать ещё' }));
  await screen.findByRole('alert'); expect(screen.getAllByRole('listitem')).toHaveLength(1);
  fetchMock.mockImplementation(async () => json([listingItems[3]]));
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
  expect(query().get('q')).toBe('второй'); expect(query().get('cursor')).toBe('same');
});

test('пустой набор фильтров отличается от пустого аккаунта', async () => {
  fetchMock.mockImplementation(async () => json([]));
  open('?q=нет'); await screen.findByText('Ничего не найдено');
  fireEvent.click(screen.getAllByRole('button', { name: 'Сбросить фильтры' })[1]!);
  await screen.findByText('Пока нет объявлений');
});

test('query-only popstate восстанавливает фильтры и отменяет отложенный ввод', async () => {
  open('?q=первый'); await screen.findByRole('list');
  fireEvent.change(screen.getByLabelText('Поиск по адресу'), { target: { value: 'не применён' } });
  act(() => { window.history.replaceState(null, '', '/app?q=второй&to=2026-10-01'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await waitFor(() => expect(query().get('q')).toBe('второй'));
  expect(screen.getByLabelText('Поиск по адресу')).toHaveValue('второй');
  await new Promise((resolve) => setTimeout(resolve, 350));
  expect(query().get('q')).toBe('второй');
});
for (const search of ['?from=2026-02-30', '?from=2026-11-02&to=2026-11-01', '?q=a&q=b']) {
  test(`неверный URL ${search} не отправляется, доступен сброс`, async () => {
    open(search); expect(screen.getByRole('alert')).toBeVisible(); expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' })); await screen.findByRole('list');
    expect(query().has('from')).toBe(false);
  });
}

for (const invalidField of ['from', 'to'] as const) {
  test(`незавершённая ${invalidField} остаётся ошибкой при изменении соседних полей`, async () => {
    open('?from=2026-10-01&to=2026-10-23'); await screen.findByRole('list');
    const input = screen.getByLabelText(invalidField === 'from' ? 'Дата создания: с' : 'Дата создания: по');
    Object.defineProperty(input, 'validity', { configurable: true, value: { badInput: true } });
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByRole('alert')).toHaveTextContent('корректные даты');
    fireEvent.change(screen.getByLabelText('Поиск по адресу'), { target: { value: 'Лесной' } });
    expect(screen.getByRole('alert')).toHaveTextContent('корректные даты');
    const other = screen.getByLabelText(invalidField === 'from' ? 'Дата создания: по' : 'Дата создания: с');
    fireEvent.change(other, { target: { value: '2026-10-20' } });
    enter(); await act(async () => new Promise((resolve) => setTimeout(resolve, 350)));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('?from=2026-10-01&to=2026-10-23');
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
    await screen.findByRole('list');
    expect((screen.getByLabelText(invalidField === 'from' ? 'Дата создания: с' : 'Дата создания: по') as HTMLInputElement).validity.badInput).toBe(false);
    expect(window.location.search).toBe('');
  });
}
