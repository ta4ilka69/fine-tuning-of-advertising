import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AppProvider } from '../../src/app/AppProvider';
import { App } from '../../src/app/App';
import { confirmNavigation, navigate } from '../../src/app/navigation';
import { ListingForm } from '../../src/features/listing-form/ListingForm';
import { RequestError } from '../../src/shared/api/errors';
import { listing, listingDetails } from '../fixtures/listings';

const id = '70792597-4a2a-4ddb-9d00-c2340dd8c016';
const renderForm = (onSave = vi.fn().mockResolvedValue({ id }), props = {}) => {
  const onSaved = vi.fn(); const onUnauthorized = vi.fn();
  render(<AppProvider><ListingForm onSave={onSave} onSaved={onSaved} onUnauthorized={onUnauthorized} {...props} /></AppProvider>);
  return { onSave, onSaved, onUnauthorized };
};
const set = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
const save = () => screen.getByRole('button', { name: 'Сохранить черновик' });
const submitForm = () => fireEvent.submit(screen.getByRole('form', { name: 'Создание объявления' }));
const problem = (status: number, fields: string[] = []) => new RequestError('http', status, { type: 'about:blank', title: 'Technical diagnostic', status, code: 'ERROR', requestId: 'a6cdd08a-a252-48fa-a6c5-73f485bc494e', fieldErrors: fields.map((field) => ({ field, code: 'INVALID', message: 'Secret server message' })) });
beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

test('открытие не сохраняет, пустой черновик отправляет только data', async () => {
  const { onSave, onSaved } = renderForm();
  expect(onSave).not.toHaveBeenCalled(); expect(screen.queryByRole('button', { name: 'Сгенерировать' })).not.toBeInTheDocument();
  expect(screen.getByRole('complementary')).toHaveTextContent('Для генерации позже понадобятся');
  await userEvent.click(save());
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(id)); expect(onSave.mock.calls[0]![0]).toEqual({});
});

test('поля сделки и объекта переключаются с сохранением общих и подходящих значений', async () => {
  const { onSave } = renderForm();
  set('Тип сделки', 'rent'); set('Тип недвижимости', 'flat'); set('Цена за месяц, ₽', '65000');
  set('Количество комнат', '0'); set('Залог, ₽', '0'); set('Комиссия, %', '0'); set('Апартаменты', 'false'); set('Можно с животными', 'false');
  set('Тип недвижимости', 'house'); set('Тип сделки', 'sale');
  expect(screen.queryByLabelText('Количество комнат', { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Можно с животными')).not.toBeInTheDocument();
  set('Тип недвижимости', 'flat'); set('Тип сделки', 'rent');
  expect(screen.getByLabelText('Количество комнат', { exact: true })).toHaveValue('0'); expect(screen.getByLabelText('Можно с животными')).toHaveValue('false');
  await userEvent.click(save()); expect(onSave.mock.calls[0]![0]).toMatchObject({ deal: { type: 'rent', price: 65000, deposit: 0, commissionPercent: 0 }, object: { type: 'flat', roomsCount: 0, isApartments: false }, rules: { petsAllowed: false } });
});

test('ошибки чисел раскрывают раздел и фокусируют первое поле, предупреждения не блокируют', async () => {
  const { onSave } = renderForm(); set('Тип недвижимости', 'flat'); set('Этажей в здании', '0');
  await userEvent.click(save()); expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Этажей в здании')).toHaveFocus(); expect(screen.getByLabelText('Этажей в здании').closest('details')).toHaveAttribute('open');
  set('Этажей в здании', '9'); set('Этаж', '10'); set('Общая площадь, м²', '20'); set('Жилая площадь, м²', '21'); set('Площадь кухни, м²', '22');
  expect(screen.getByText('Этаж выше этажности здания')).toBeInTheDocument();
  await userEvent.click(save()); await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
});

test('станции метро добавляются, проверяются и удаляются; ошибки связаны с вводом', async () => {
  const { onSave } = renderForm();
  await userEvent.click(screen.getByRole('button', { name: 'Добавить станцию метро' }));
  set('Время в пути, мин — станция 1', '0');
  await userEvent.click(save()); expect(onSave).not.toHaveBeenCalled(); expect(screen.getByLabelText('Название станции 1')).toHaveFocus();
  set('Название станции 1', 'Лесная'); set('Как добраться — станция 1', 'walk');
  await userEvent.click(screen.getByRole('button', { name: 'Добавить станцию метро' }));
  set('Название станции 2', 'Парк'); await userEvent.click(screen.getByRole('button', { name: 'Удалить станцию 2' }));
  await userEvent.click(save()); expect(onSave.mock.calls[0]![0]).toEqual({ location: { undergrounds: [{ name: 'Лесная', minutes: 0, transportType: 'walk' }] } });
});

for (const failure of [problem(400, ['/data/house/landArea']), problem(422, ['/data/deal/price']), problem(401), problem(403), problem(429), problem(503), new RequestError('network'), new RequestError('invalid-response'), new Error('secret')] as const) {
  test(`сбой ${failure instanceof RequestError ? failure.kind : 'unexpected'} ${failure instanceof RequestError ? failure.status : ''} сохраняет ввод и допускает только ручной повтор`, async () => {
    const onSave = vi.fn().mockRejectedValue(failure); const { onSaved, onUnauthorized } = renderForm(onSave);
    set('Тип недвижимости', 'house'); set('Комментарий об объекте', 'Важно сохранить');
    await userEvent.click(save()); await screen.findByRole('alert');
    expect(onSave).toHaveBeenCalledOnce(); expect(onSaved).not.toHaveBeenCalled(); expect(screen.getByLabelText('Комментарий об объекте')).toHaveValue('Важно сохранить');
    expect(screen.getByRole('alert')).not.toHaveTextContent(/Technical|Secret|secret/);
    if (failure instanceof RequestError && failure.status === 400) { expect(screen.getByLabelText('Площадь участка')).toHaveFocus(); expect(screen.getByLabelText('Площадь участка').closest('details')).toHaveAttribute('open'); }
    if (failure instanceof RequestError && failure.status === 422) expect(screen.getByLabelText('Стоимость объекта, ₽')).toHaveFocus();
    expect(onUnauthorized).toHaveBeenCalledTimes(failure instanceof RequestError && failure.status === 401 ? 1 : 0);
    onSave.mockResolvedValue({ id }); await userEvent.click(save()); expect(onSave).toHaveBeenCalledTimes(2); await waitFor(() => expect(onSaved).toHaveBeenCalledWith(id));
  });
}

test('повторная отправка блокируется синхронно, поля отключены, отмена игнорирует поздний ответ', async () => {
  let release!: (value: { id: string }) => void;
  const onSave = vi.fn().mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  const { onSaved } = renderForm(onSave);
  set('Адрес', 'Санкт-Петербург');
  submitForm(); submitForm();
  expect(onSave).toHaveBeenCalledOnce(); expect(screen.getByLabelText('Адрес')).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Сохраняем объявление');
  await act(async () => release({ id })); expect(onSaved).toHaveBeenCalledOnce();
});

test('уход требует подтверждения, успешное сохранение снимает предупреждение', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const { onSave } = renderForm();
  expect(confirmNavigation()).toBe(true); set('Адрес', 'Санкт-Петербург');
  const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
  act(() => navigate('/app')); expect(window.location.pathname).toBe('/'); expect(confirm).toHaveBeenCalledOnce();
  await userEvent.click(save()); await waitFor(() => expect(onSave).toHaveBeenCalledOnce()); expect(confirmNavigation()).toBe(true);
});

test('размонтирование отменяет POST и поздние ошибки не трогают сессию', async () => {
  let reject!: (error: unknown) => void;
  const onSave = vi.fn().mockImplementation(() => new Promise((_, fail) => { reject = fail; })); const onUnauthorized = vi.fn(); const onSaved = vi.fn();
  const view = render(<AppProvider><ListingForm onSave={onSave} onSaved={onSaved} onUnauthorized={onUnauthorized} /></AppProvider>);
  submitForm(); const signal = onSave.mock.calls[0]![1] as AbortSignal;
  view.unmount(); expect(signal.aborted).toBe(true);
  await act(async () => reject(problem(401))); expect(onUnauthorized).not.toHaveBeenCalled(); expect(onSaved).not.toHaveBeenCalled();
});

test('успех проходит через API и открывает созданное объявление, новая форма пуста', async () => {
  const user = { id: '9a07b31d-ac15-495c-bb91-e3756fe40bcc', login: 'agent_demo', role: 'agent' };
  const data = { object: { type: 'flat', isApartments: true }, location: { address: 'Лесной проспект' } };
  const detail = { ...listingDetails(listing({ id, status: 'draft', hasResult: false })), data, photos: [] };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fetch = vi.fn<typeof window.fetch>().mockImplementation(async (url, options) => String(url).endsWith('/me') ? json({ user }) : options?.method === 'POST' ? json(detail, 201) : String(url).includes('/listings/') ? json(detail) : json({ items: [], nextCursor: null })); vi.stubGlobal('fetch', fetch);
  window.history.replaceState(null, '', '/app/new'); render(<App />);
  await screen.findByRole('form', { name: 'Создание объявления' });
  set('Тип недвижимости', 'flat'); set('Апартаменты', 'true'); set('Адрес', 'Лесной проспект');
  await userEvent.click(save()); await screen.findByRole('heading', { name: 'Лесной проспект' });
  expect(window.location.pathname).toBe(`/app/listings/${id}`); expect(screen.getByText(/Апартаменты/)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: '← Мои объявления' }));
  await userEvent.click((await screen.findAllByRole('button', { name: 'Создать объявление' }))[0]!);
  await screen.findByRole('form', { name: 'Создание объявления' }); expect(screen.getByLabelText('Адрес')).toHaveValue('');
  const post = fetch.mock.calls.filter(([, options]) => options?.method === 'POST'); expect(post).toHaveLength(1); expect(JSON.parse(post[0]![1]!.body as string)).toEqual({ data });
});

test('401 с действующей сессией сохраняет форму после restore', async () => {
  const user = { id: '9a07b31d-ac15-495c-bb91-e3756fe40bcc', login: 'agent_demo', role: 'agent' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fetch = vi.fn<typeof window.fetch>().mockImplementation(async (_, options) => options?.method === 'POST' ? json({}, 401) : json({ user })); vi.stubGlobal('fetch', fetch);
  window.history.replaceState(null, '', '/app/new'); render(<App />);
  await screen.findByRole('form', { name: 'Создание объявления' }); set('Адрес', 'Не терять');
  await userEvent.click(save()); await waitFor(() => expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/me'))).toHaveLength(2));
  await waitFor(() => expect(screen.getByLabelText('Адрес')).toHaveValue('Не терять'));
});

test('ошибки API раскрывают все разделы и фокусируют первое поле в порядке формы', async () => {
  const onSave = vi.fn().mockRejectedValue(problem(422, ['/data/building/buildYear', '/data/deal/price', '/data/legal/hasMinorOwners']));
  renderForm(onSave); set('Тип недвижимости', 'flat'); set('Тип сделки', 'sale');
  await userEvent.click(save()); await screen.findByRole('alert');
  expect(screen.getByLabelText('Стоимость объекта, ₽')).toHaveFocus();
  expect(screen.getByLabelText('Год постройки здания').closest('details')).toHaveAttribute('open');
  expect(screen.getByLabelText('Несовершеннолетние собственники').closest('details')).toHaveAttribute('open');
});

test('неизвестный флаг отличается от явного «нет»', async () => {
  const { onSave } = renderForm(); set('Тип недвижимости', 'flat');
  set('Апартаменты', 'true'); set('Апартаменты', 'false'); set('Апартаменты', '');
  set('Пентхаус', 'false'); await userEvent.click(save());
  expect(onSave.mock.calls[0]![0]).toEqual({ object: { type: 'flat', isPenthouse: false } });
});

test('ошибка перепроверки сессии сохраняет предупреждение о несохранённом черновике', async () => {
  const user = { id: '9a07b31d-ac15-495c-bb91-e3756fe40bcc', login: 'agent_demo', role: 'agent' };
  let checks = 0;
  vi.stubGlobal('fetch', vi.fn<typeof window.fetch>().mockImplementation(async (_, options) => {
    const status = options?.method === 'POST' ? 401 : ++checks === 1 ? 200 : 503;
    return new Response(JSON.stringify(status === 200 ? { user } : {}), { status, headers: { 'Content-Type': 'application/json' } });
  }));
  window.history.replaceState(null, '', '/app/new'); render(<App />);
  await screen.findByRole('form', { name: 'Создание объявления' }); set('Адрес', 'Не терять');
  await userEvent.click(save()); await screen.findByText('Не удалось проверить сессию');
  const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  act(() => navigate('/')); expect(confirm).toHaveBeenCalledOnce(); expect(window.location.pathname).toBe('/app/new');
});
