import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import type { ReactNode } from 'react';
import { theme, cssVariablesResolver } from '../../src/app/theme';
import EditListing from '../../src/pages/account/EditListing';
import { PhotoManager, type PhotoState } from '../../src/features/listing-photos/model';
import { ListingDetails } from '../../src/pages/account/ListingDetails';
import { parseListing } from '../../src/shared/api/listings';
import type { Listing } from '../../src/shared/api/types';
import { listingDetails } from '../fixtures/listings';

const AppProvider = ({ children }: { children: ReactNode }) => <MantineProvider env="test" theme={theme} cssVariablesResolver={cssVariablesResolver} forceColorScheme="light">{children}</MantineProvider>;

let detail: Listing;
let error: number | 'network' | 'invalid' | undefined;
let code: string;
let readError: boolean;
const recheck = vi.fn();
const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200, problem = false) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': problem ? 'application/problem+json' : 'application/json' } });
const set = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
const save = () => screen.getByRole('button', { name: 'Сохранить изменения' });
const puts = () => fetchMock.mock.calls.filter(([, options]) => options?.method === 'PUT');
const open = async () => {
  const view = render(<AppProvider><ListingDetails id={detail.id} recheck={recheck} /></AppProvider>);
  await userEvent.click(await screen.findByRole('button', { name: 'Редактировать объявление' }));
  await screen.findByRole('form', { name: 'Редактирование объявления' });
  return view;
};
beforeEach(() => {
  Object.defineProperty(document, 'fonts', { configurable: true, value: new EventTarget() });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  detail = parseListing(listingDetails()); error = undefined; code = 'VERSION_CONFLICT'; readError = false; recheck.mockClear();
  fetchMock.mockImplementation(async (_url, options) => {
    if (options?.method !== 'PUT') {
      if (readError) return json({}, 503);
      return json(detail);
    }
    if (error === 'network') throw new TypeError('network');
    if (error === 'invalid') return json({ wrong: true });
    if (error) return json({ type: 'about:blank', title: 'Technical diagnostic', status: error, code, requestId: 'a6cdd08a-a252-48fa-a6c5-73f485bc494e', fieldErrors: [{ field: '/data/building/buildYear', code: 'INVALID', message: 'Technical' }] }, error, true);
    const input = JSON.parse(String(options?.body)) as { data: Listing['data'] };
    detail = { ...detail, data: input.data, version: detail.version + 1, status: 'draft' };
    return json(detail);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); fetchMock.mockReset(); });

test('полный снимок, карточка после PUT, серверная форма и следующая версия', async () => {
  detail.data.object = { type: 'flat', roomsCount: 0, isApartments: false };
  const result = detail.result;
  await open(); expect(screen.getByLabelText('Количество комнат')).toHaveValue('0');
  expect(screen.getByRole('button', { name: 'Выбрать фотографии' })).toBeDisabled();
  set('Адрес', 'Новый адрес'); await userEvent.click(save());
  expect(await screen.findByText('Изменения сохранены', { exact: true })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Новый адрес' })).toBeVisible();
  expect(JSON.parse(String(puts()[0]![1]!.body))).toMatchObject({ expectedVersion: 2, data: { object: { roomsCount: 0, isApartments: false } } });
  set('Адрес', 'Следующий адрес'); await userEvent.click(save()); await waitFor(() => expect(puts()).toHaveLength(2));
  expect(JSON.parse(String(puts()[1]![1]!.body))).toMatchObject({ expectedVersion: 3 }); expect(detail.result).toEqual(result);
  const confirm = vi.spyOn(window, 'confirm'); await userEvent.click(screen.getByRole('button', { name: 'Отменить редактирование' }));
  expect(confirm).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Выбрать фотографии' })).toBeEnabled();
});

for (const failure of [401, 403, 404, 422, 429, 503, 'network', 'invalid'] as const) test(`ошибка ${failure}, ввод и безопасное сообщение`, async () => {
  await open(); set('Адрес', 'Не терять'); error = failure; await userEvent.click(save());
  expect(await screen.findByRole('alert')).not.toHaveTextContent('Technical'); expect(screen.getByLabelText('Адрес')).toHaveValue('Не терять'); expect(puts()).toHaveLength(1);
  if (failure === 401) expect(recheck).toHaveBeenCalledWith(true);
  if (failure === 403 || failure === 404) expect(save()).toBeDisabled();
  else {
    if (failure === 422) { expect(screen.getByLabelText('Год постройки здания')).toHaveFocus(); expect(screen.getByLabelText('Год постройки здания').closest('details')).toHaveAttribute('open'); }
    error = undefined; await userEvent.click(save()); expect(await screen.findByText('Изменения сохранены', { exact: true })).toBeVisible(); expect(puts()).toHaveLength(2);
  }
});

test('конфликт: отмена замены, просмотр копии, ошибка чтения и явная замена', async () => {
  await open(); set('Адрес', 'Мои правки'); error = 409; await userEvent.click(save());
  expect(await screen.findByText('Объявление изменилось в другом окне', { exact: true })).toBeVisible(); expect(save()).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Посмотреть мои правки' }));
  expect((screen.getByLabelText('Сохранённый ввод') as HTMLTextAreaElement).value).toContain('Мои правки');
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Мои правки' })).getByRole('button', { name: 'Вернуться к форме' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Мои правки' })).not.toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: 'Загрузить актуальные данные' }));
  await userEvent.click(within(await screen.findByRole('dialog', { name: 'Загрузить актуальные данные?' })).getByRole('button', { name: 'Вернуться к форме' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Загрузить актуальные данные?' })).not.toBeInTheDocument()); expect(screen.getByLabelText('Адрес')).toHaveValue('Мои правки');
  readError = true; await userEvent.click(screen.getByRole('button', { name: 'Загрузить актуальные данные' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Загрузить и заменить форму' })); expect(await screen.findByText('Не удалось обновить', { exact: true })).toBeVisible();
  expect(screen.getByLabelText('Адрес')).toHaveValue('Мои правки'); readError = false;
  detail = { ...detail, version: 3, data: { location: { address: 'Серверная версия' } } };
  await userEvent.click(screen.getByRole('button', { name: 'Загрузить актуальные данные' })); await userEvent.click(await screen.findByRole('button', { name: 'Загрузить и заменить форму' }));
  await waitFor(() => expect(screen.getByLabelText('Адрес')).toHaveValue('Серверная версия')); expect(puts()).toHaveLength(1);
  await userEvent.click(screen.getByRole('button', { name: 'Открыть сохранённые правки' })); expect((screen.getByLabelText('Сохранённый ввод') as HTMLTextAreaElement).value).toContain('Мои правки');
});

test('LISTING_BUSY: ручная проверка без подмены версии и ввода', async () => {
  await open(); set('Адрес', 'Мои правки'); error = 409; code = 'LISTING_BUSY'; await userEvent.click(save());
  expect(await screen.findByText('Идёт генерация', { exact: true })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Проверить состояние' })); await waitFor(() => expect(save()).toBeEnabled());
  expect(screen.getByLabelText('Адрес')).toHaveValue('Мои правки'); error = undefined;
  await userEvent.click(save()); expect(await screen.findByText('Изменения сохранены', { exact: true })).toBeVisible();
  expect(JSON.parse(String(puts()[1]![1]!.body)).expectedVersion).toBe(2);
});

test('отмена сохраняет ввод при отказе и не повторяет запрос при подтверждении', async () => {
  await open(); set('Адрес', 'Мои правки'); const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await userEvent.click(screen.getByRole('button', { name: 'Отменить редактирование' })); expect(screen.getByLabelText('Адрес')).toHaveValue('Мои правки');
  confirm.mockReturnValue(true); await userEvent.click(screen.getByRole('button', { name: 'Отменить редактирование' }));
  expect(screen.queryByRole('form', { name: 'Редактирование объявления' })).not.toBeInTheDocument(); expect(puts()).toHaveLength(0);
});

test('приостановка отменяет PUT и сохраняет форму, поздний ответ не подтверждает успех', async () => {
  const view = await open(); set('Адрес', 'Незавершённая правка');
  let release!: (value: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  await userEvent.click(save()); expect(screen.getByLabelText('Адрес')).toBeDisabled();
  view.rerender(<AppProvider><ListingDetails id={detail.id} recheck={recheck} suspended /></AppProvider>);
  expect(puts()[0]![1]!.signal!.aborted).toBe(true);
  await act(async () => release(json({ ...detail, version: 3 })));
  view.rerender(<AppProvider><ListingDetails id={detail.id} recheck={recheck} /></AppProvider>);
  expect(screen.getByLabelText('Адрес')).toHaveValue('Незавершённая правка'); expect(screen.queryByText('Изменения сохранены')).not.toBeInTheDocument();
});

for (const block of ['conflict', 'busy', 'access'] as const) test(`первая отрисовка учитывает уже обнаруженную блокировку ${block}`, async () => {
  const current = { ...detail, version: block === 'conflict' ? 3 : detail.version, status: block === 'busy' ? 'generating' as const : detail.status };
  const state: PhotoState = { listing: current, uploads: [], reading: false, paused: false, verified: true, inaccessible: block === 'access', announcement: '' };
  render(<AppProvider><EditListing initial={detail} manager={new PhotoManager(detail.id, recheck)} state={state} recheck={recheck} onCancel={() => {}} suspended={false} /></AppProvider>);
  expect(screen.getByText(block === 'conflict' ? 'Объявление изменилось в другом окне' : block === 'busy' ? 'Идёт генерация' : 'Доступ к объявлению изменился', { exact: true })).toBeVisible();
  expect(save()).toBeDisabled(); expect(screen.getByRole('button', { name: 'Загрузить актуальные данные' })).toBeEnabled(); expect(puts()).toHaveLength(0);
});

for (const dialog of ['Мои правки', 'Загрузить актуальные данные?']) test(`приостановка скрывает portal ${dialog} и сохраняет ввод`, async () => {
  const view = await open(); set('Адрес', 'Секретный ввод'); error = 409; await userEvent.click(save());
  await userEvent.click(await screen.findByRole('button', { name: dialog === 'Мои правки' ? 'Посмотреть мои правки' : 'Загрузить актуальные данные' }));
  expect(await screen.findByRole('dialog', { name: dialog })).toBeVisible();
  view.rerender(<AppProvider><ListingDetails id={detail.id} recheck={recheck} suspended /></AppProvider>);
  await waitFor(() => expect(screen.queryByRole('dialog', { name: dialog })).not.toBeInTheDocument());
  expect(screen.getByLabelText('Адрес')).toHaveValue('Секретный ввод');
  view.rerender(<AppProvider><ListingDetails id={detail.id} recheck={recheck} /></AppProvider>);
  expect(await screen.findByRole('dialog', { name: dialog })).toBeVisible();
  if (dialog === 'Мои правки') expect((screen.getByLabelText('Сохранённый ввод') as HTMLTextAreaElement).value).toContain('Секретный ввод');
});
