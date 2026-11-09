import { afterEach, expect, test, vi } from 'vitest';
import { listings } from '../../src/shared/api/listings';
import { PhotoManager } from '../../src/features/listing-photos/model';
import { listingDetails } from '../fixtures/listings';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code = 'FAILED') => new Response(JSON.stringify({ type: 'about:blank', title: 'Technical diagnostic', status, code, requestId: 'a6cdd08a-a252-48fa-a6c5-73f485bc494e' }), { status, headers: { 'Content-Type': 'application/problem+json' } });
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

for (const id of ['../admin', 'bad', '']) test(`неверный id ${id}`, () => expect(() => listings.remove(id, 1)).toThrow(TypeError));
for (const version of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) test(`неверная версия ${version}`, () => expect(() => listings.remove(listingDetails().id, version)).toThrow(TypeError));
test('DELETE: точные ID, query, signal и пустой 204 без чтения JSON', async () => {
  const response = new Response(null, { status: 204 }); const read = vi.spyOn(response, 'json');
  const fetchMock = vi.fn().mockResolvedValue(response); vi.stubGlobal('fetch', fetchMock);
  const signal = new AbortController().signal;
  expect(await listings.remove(listingDetails().id, 7, signal)).toBeUndefined();
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`/api/v1/listings/${listingDetails().id}?expectedVersion=7`, expect.objectContaining({ method: 'DELETE', signal, body: undefined }));
  expect(read).not.toHaveBeenCalled();
});

async function setup() {
  let detail = listingDetails();
  const fetchMock = vi.fn().mockImplementation(async (_url, options) => options?.method === 'DELETE' ? new Response(null, { status: 204 }) : json(detail));
  vi.stubGlobal('fetch', fetchMock);
  const recheck = vi.fn(); const manager = new PhotoManager(detail.id, recheck); manager.start(); await tick();
  return { manager, fetchMock, recheck, setDetail: (value: typeof detail) => { detail = value; } };
}

test('отмена, общая блокировка, двойное подтверждение и отсутствие запросов после успеха', async () => {
  const { manager, fetchMock } = await setup();
  manager.beginListingDelete(); manager.cancelListingDelete(); expect(fetchMock).toHaveBeenCalledTimes(1);
  manager.beginListingDelete();
  manager.add([new File(['a'], 'a.jpg', { type: 'image/jpeg' })]); manager.remove(manager.snapshot().listing!.photos[0]!.id); manager.resume(); manager.refresh();
  expect(manager.beginEdit()).toBeUndefined(); expect(manager.snapshot().uploads).toEqual([]);
  let resolve!: (response: Response) => void;
  fetchMock.mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
  const first = manager.confirmListingDelete(); const second = manager.confirmListingDelete();
  expect(manager.snapshot().listingDeletion?.phase).toBe('deleting'); expect(fetchMock).toHaveBeenCalledTimes(2);
  manager.cancelListingDelete(); expect(manager.snapshot().listingDeletion?.phase).toBe('deleting');
  resolve(new Response(null, { status: 204 })); await Promise.all([first, second]);
  expect(manager.snapshot().listingDeletion?.phase).toBe('deleted'); manager.refresh(); await tick(); expect(fetchMock).toHaveBeenCalledTimes(2); manager.stop();
});

for (const [status, code, phase] of [[401, 'UNAUTHENTICATED', 'uncertain'], [403, 'FORBIDDEN', 'denied'], [404, 'NOT_FOUND', 'missing'], [409, 'VERSION_CONFLICT', 'conflict'], [409, 'LISTING_BUSY', 'busy'], [422, 'VALIDATION_ERROR', 'error'], [503, 'UNAVAILABLE', 'uncertain']] as const) test(`ошибка ${status}/${code}`, async () => {
  const { manager, fetchMock, recheck } = await setup(); manager.beginListingDelete(); fetchMock.mockResolvedValue(problem(status, code));
  await manager.confirmListingDelete(); expect(manager.snapshot().listingDeletion?.phase).toBe(phase); expect(manager.snapshot().listing).toBeDefined();
  expect(manager.snapshot().listingDeletion?.error).not.toContain('Technical');
  expect(fetchMock).toHaveBeenCalledTimes(2); if (status === 401) expect(recheck).toHaveBeenCalledWith(true);
  manager.stop();
});

test('конфликт: только явный GET, новый снимок и новое подтверждение', async () => {
  const { manager, fetchMock, setDetail } = await setup(); manager.beginListingDelete(); fetchMock.mockResolvedValueOnce(problem(409, 'VERSION_CONFLICT'));
  await manager.confirmListingDelete(); manager.cancelListingDelete(); expect(manager.snapshot().listingDeletion?.phase).toBe('conflict');
  await manager.confirmListingDelete(); expect(fetchMock).toHaveBeenCalledTimes(2);
  setDetail({ ...listingDetails(), version: 9, data: { location: { address: 'Другой адрес' } } });
  await manager.checkListingDelete(); expect(manager.snapshot().listingDeletion).toMatchObject({ phase: 'confirm', listing: { version: 9, address: 'Другой адрес' } });
  expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'DELETE')).toHaveLength(1);
  await manager.confirmListingDelete(); expect(fetchMock.mock.calls.at(-1)![0]).toContain('expectedVersion=9'); manager.stop();
});

for (const failure of ['network', 'invalid', '503'] as const) test(`неизвестный результат ${failure}: сначала GET, 404 подтверждает отсутствие`, async () => {
  const { manager, fetchMock } = await setup(); manager.beginListingDelete();
  if (failure === 'network') fetchMock.mockRejectedValueOnce(new TypeError('network'));
  else fetchMock.mockResolvedValueOnce(failure === 'invalid' ? json({}) : problem(503));
  await manager.confirmListingDelete(); manager.cancelListingDelete(); await manager.confirmListingDelete(); expect(fetchMock).toHaveBeenCalledTimes(2);
  fetchMock.mockResolvedValueOnce(problem(404)); await manager.checkListingDelete(); expect(manager.snapshot().listingDeletion?.phase).toBe('deleted'); manager.stop();
});

test('ошибка сверки, старая версия, генерация и ручной повтор проверки', async () => {
  const { manager, fetchMock, setDetail } = await setup(); manager.beginListingDelete(); fetchMock.mockRejectedValueOnce(new TypeError()); await manager.confirmListingDelete();
  fetchMock.mockResolvedValueOnce(problem(503)); await manager.checkListingDelete(); expect(manager.snapshot().listingDeletion?.phase).toBe('uncertain');
  setDetail({ ...listingDetails(), version: 1 }); await manager.checkListingDelete(); expect(manager.snapshot().listingDeletion?.phase).toBe('uncertain');
  setDetail({ ...listingDetails(), status: 'generating' }); await manager.checkListingDelete(); expect(manager.snapshot().listingDeletion?.phase).toBe('busy');
  setDetail(listingDetails()); await manager.checkListingDelete(); expect(manager.snapshot().listingDeletion?.phase).toBe('confirm'); manager.stop();
});

for (const read of [false, true]) test(`уход и поздний ответ ${read ? 'GET' : 'DELETE'}, безопасное возобновление`, async () => {
  const { manager, fetchMock } = await setup(); manager.beginListingDelete();
  if (read) { fetchMock.mockRejectedValueOnce(new TypeError()); await manager.confirmListingDelete(); }
  let resolve!: (response: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }));
  const pending = read ? manager.checkListingDelete() : manager.confirmListingDelete();
  const signal = fetchMock.mock.calls.at(-1)![1].signal as AbortSignal;
  manager.stop(); expect(signal.aborted).toBe(true); manager.start();
  resolve(read ? json(listingDetails()) : new Response(null, { status: 204 })); await pending;
  expect(manager.snapshot().listingDeletion?.phase).toBe('uncertain'); expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'DELETE')).toHaveLength(1); manager.stop();
});

test('во время чтения, редактирования и очереди фотографий удаление не начинается', async () => {
  const { manager, fetchMock } = await setup(); manager.beginEdit(); expect(manager.beginListingDelete()).toBeUndefined(); manager.endEdit();
  fetchMock.mockImplementation(() => new Promise(() => {})); manager.refresh(); expect(manager.beginListingDelete()).toBeUndefined(); manager.stop();
  const next = await setup(); next.fetchMock.mockImplementation(() => new Promise(() => {}));
  next.manager.add([new File(['a'], 'a.jpg', { type: 'image/jpeg' })]); expect(next.manager.beginListingDelete()).toBeUndefined(); next.manager.stop();
});

for (const status of [401, 403, 404]) test(`ошибка сверки ${status} и защита повторного GET`, async () => {
  const { manager, fetchMock, recheck } = await setup(); manager.beginListingDelete();
  fetchMock.mockResolvedValueOnce(problem(409, 'VERSION_CONFLICT')); await manager.confirmListingDelete();
  fetchMock.mockResolvedValueOnce(problem(status)); const a = manager.checkListingDelete(); const b = manager.checkListingDelete(); await Promise.all([a, b]);
  expect(fetchMock).toHaveBeenCalledTimes(3); expect(manager.snapshot().listingDeletion?.phase).toBe(status === 401 ? 'uncertain' : status === 403 ? 'denied' : 'missing');
  if (status === 401) expect(recheck).toHaveBeenCalledWith(true); manager.stop();
});
