import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { ListingDetails } from '../../src/pages/account/ListingDetails';
import { listingDetails, listing } from '../fixtures/listings';

const fetchMock = vi.fn<typeof fetch>();
const recheck = vi.fn();
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const trigger = () => screen.getByRole('button', { name: 'Удалить объявление' });
const dialog = () => screen.getByRole('dialog', { name: 'Удалить объявление?' });
const open = async () => {
  const view = render(<MantineProvider env="test"><ListingDetails id={listing().id} recheck={recheck} /></MantineProvider>);
  await userEvent.click(await screen.findByRole('button', { name: 'Удалить объявление' })); return view;
};
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(document, 'fonts', { configurable: true, value: new EventTarget() });
  fetchMock.mockImplementation(async () => json(listingDetails())); vi.stubGlobal('fetch', fetchMock); recheck.mockClear();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); fetchMock.mockReset(); });

test('подтверждение называет объект и последствия, отмена не отправляет DELETE', async () => {
  await open(); expect(dialog()).toHaveTextContent(listing().address!); expect(dialog()).toHaveAccessibleDescription(/фотографии и результаты/);
  await userEvent.click(within(dialog()).getByRole('button', { name: 'Отмена' })); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(screen.getByRole('button', { name: 'Редактировать объявление' })).toBeEnabled();
});

test('ошибка сервера: данные сохранены, повтор только после GET и нового подтверждения', async () => {
  await open(); fetchMock.mockResolvedValueOnce(json({}, 503)); await userEvent.click(within(dialog()).getByRole('button', { name: 'Удалить' }));
  expect(within(dialog()).getByRole('alert')).toHaveTextContent('Не удалось подтвердить удаление');
  expect(within(dialog()).queryByRole('button', { name: 'Удалить' })).not.toBeInTheDocument();
  await userEvent.click(within(dialog()).getByRole('button', { name: 'Проверить состояние' }));
  expect(await within(dialog()).findByText('Проверьте актуальные данные')).toBeVisible();
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'DELETE')).toHaveLength(1);
});

test('черновик без адреса и блокировка известной генерации', async () => {
  fetchMock.mockResolvedValue(json(listingDetails(listing({ address: null, status: 'generating', hasResult: false }))));
  await open(); expect(dialog()).toHaveTextContent('Черновик от'); expect(within(dialog()).queryByRole('button', { name: 'Удалить' })).not.toBeInTheDocument();
  await userEvent.click(within(dialog()).getByRole('button', { name: 'Отмена' })); expect(trigger()).toBeEnabled();
});

test('повторные события и unmount отменяют DELETE; поздний ответ не меняет маршрут', async () => {
  const view = await open(); let resolve!: (response: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const button = within(dialog()).getByRole('button', { name: 'Удалить' }); fireEvent.click(button); fireEvent.click(button);
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'DELETE')).toHaveLength(1);
  const signal = fetchMock.mock.calls.at(-1)![1]!.signal!; const path = window.location.pathname;
  view.unmount(); expect(signal.aborted).toBe(true); await act(async () => resolve(new Response(null, { status: 204 })));
  await waitFor(() => expect(window.location.pathname).toBe(path));
});
