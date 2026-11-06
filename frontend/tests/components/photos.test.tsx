import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AppProvider } from '../../src/app/AppProvider';
import { ListingDetails } from '../../src/pages/account/ListingDetails';
import { listingDetails } from '../fixtures/listings';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const createURL = vi.fn(() => 'blob:test-photo');
const revokeURL = vi.fn();
const fetchMock = vi.fn<typeof fetch>();
let detail: ReturnType<typeof listingDetails>;
let upload: () => Promise<Response>;
const anotherPhoto = (name = 'second.png') => {
  const id = '70792597-4a2a-4ddb-9d00-c2340dd8c099';
  return { ...detail.photos[0]!, id, fileName: name,
    contentUrl: `/api/v1/listings/${detail.id}/photos/${id}/content`, thumbnailUrl: `/api/v1/listings/${detail.id}/photos/${id}/thumbnail` };
};
const open = async () => {
  const view = render(<AppProvider><ListingDetails id={detail.id} recheck={vi.fn()} /></AppProvider>);
  await screen.findByRole('heading', { name: /Фото/ }); return view;
};
beforeEach(() => {
  detail = listingDetails(); createURL.mockClear(); revokeURL.mockClear();
  URL.createObjectURL = createURL; URL.revokeObjectURL = revokeURL;
  upload = async () => json({ version: 3, photo: anotherPhoto() }, 201);
  fetchMock.mockImplementation(async (_url, options) => options?.method === 'POST' ? upload() : options?.method === 'DELETE' ? json({ version: 4 }) : json(detail));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; fetchMock.mockReset(); vi.unstubAllGlobals(); });

test('кнопка выбора открывает multiple input, превью освобождается после успеха', async () => {
  const { unmount } = await open();
  const input = screen.getByLabelText('Фотографии объявления');
  const click = vi.spyOn(input as HTMLInputElement, 'click');
  await userEvent.click(screen.getByRole('button', { name: 'Выбрать фотографии' })); expect(click).toHaveBeenCalledOnce();
  let release!: (value: Response) => void; upload = () => new Promise((resolve) => { release = resolve; });
  const file = new File(['jpeg'], 'local.jpg', { type: 'image/jpeg' });
  fireEvent.change(input, { target: { files: [file] } });
  expect(await screen.findByText('Загружаем файл…')).toBeVisible();
  expect(screen.getByRole('img', { name: 'local.jpg' })).toHaveAttribute('src', 'blob:test-photo');
  expect(createURL).toHaveBeenCalledWith(file);
  await act(async () => release(json({ version: 3, photo: anotherPhoto('local.jpg') }, 201)));
  expect(await screen.findByRole('heading', { name: 'Фото · 2 из 20' })).toBeVisible();
  expect(revokeURL).toHaveBeenCalledWith('blob:test-photo'); unmount();
});

test('ошибка изображения имеет доступную подпись; удаление возвращает фокус', async () => {
  detail.photos.push(anotherPhoto());
  await open(); fireEvent.error(screen.getByRole('img', { name: 'room.jpg' }));
  expect(screen.getByRole('img', { name: 'Не удалось показать превью room.jpg' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Удалить фотографию room.jpg' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Удалить фотографию second.png' })).toHaveFocus());
});

test('отклонённый файл можно убрать; незавершённые object URL освобождаются при уходе', async () => {
  upload = () => new Promise(() => {}); const { unmount } = await open();
  fireEvent.change(screen.getByLabelText('Фотографии объявления'), { target: { files: [new File(['x'], 'bad.txt', { type: 'text/plain' }), new File(['jpeg'], 'pending.jpg', { type: 'image/jpeg' })] } });
  expect(await screen.findByText('Выберите JPEG или PNG.')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Убрать из очереди bad.txt' }));
  expect(screen.queryByText('bad.txt')).not.toBeInTheDocument(); unmount(); expect(revokeURL).toHaveBeenCalledWith('blob:test-photo');
});

test('смена пользователя отменяет очередь и изолирует запоздалую загрузку', async () => {
  const { App } = await import('../../src/app/App');
  let userId = '9a07b31d-ac15-495c-bb91-e3756fe40bcc';
  let release!: (value: Response) => void;
  upload = () => new Promise((resolve) => { release = resolve; });
  fetchMock.mockImplementation(async (url, options) => String(url).endsWith('/me') ? json({ user: { id: userId, login: 'agent', role: 'agent' } })
    : options?.method === 'POST' ? upload() : json(detail));
  window.history.replaceState(null, '', `/app/listings/${detail.id}`); const view = render(<App />);
  await screen.findByRole('heading', { name: 'Фото · 1 из 20' });
  fireEvent.change(screen.getByLabelText('Фотографии объявления'), { target: { files: [new File(['x'], 'old-user.jpg', { type: 'image/jpeg' }), new File(['x'], 'next.jpg', { type: 'image/jpeg' })] } });
  await screen.findByText('Загружаем файл…');
  const post = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')!;
  const latePhoto = anotherPhoto('old-user.jpg');
  userId = '9a07b31d-ac15-495c-bb91-e3756fe40bcd'; detail = { ...detail, photos: [] };
  act(() => window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true })));
  await screen.findByRole('heading', { name: 'Фото · 0 из 20' }); expect(post[1]!.signal!.aborted).toBe(true);
  await act(async () => release(json({ version: 3, photo: latePhoto }, 201)));
  expect(screen.getByRole('heading', { name: 'Фото · 0 из 20' })).toBeVisible(); expect(screen.queryByText('old-user.jpg')).not.toBeInTheDocument();
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1); view.unmount(); window.history.replaceState(null, '', '/');
});
