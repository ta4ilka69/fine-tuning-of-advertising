import { afterEach, expect, test, vi } from 'vitest';
import { photos, parsePhoto, photoAddress } from '../../src/shared/api/photos';
import { parseListing, listings } from '../../src/shared/api/listings';
import { PhotoManager, fileError } from '../../src/features/listing-photos/model';
import { RequestError } from '../../src/shared/api/errors';
import { listingDetails } from '../fixtures/listings';

const detail = listingDetails();
const id = detail.id;
const photo = parsePhoto(detail.photos[0], id);
const overview = () => parseListing(structuredClone(detail));
const file = (name = 'room.jpg') => new File(['jpeg'], name, { type: 'image/jpeg' });
const managers: PhotoManager[] = [];
const manager = (recheck = vi.fn()) => { const value = new PhotoManager(id, recheck); managers.push(value); value.start(); return value; };
const loaded = async (value: PhotoManager) => { await vi.waitFor(() => expect(value.snapshot().verified).toBe(true)); };
const response = (value: unknown, status = 201) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
afterEach(() => { managers.splice(0).forEach((value) => value.stop()); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

for (const [type, size, valid] of [
  ['image/jpeg', 1, true], ['image/png', 15000000, true], ['image/jpeg', 0, false], ['image/png', 15000001, false],
  ['image/heic', 10, false], ['text/plain', 10, false], ['', 10, false],
] as const) test(`проверка файла ${type}/${size}`, () => expect(fileError({ type, size }) === undefined).toBe(valid));

for (const patch of [
  { id: 'bad' }, { listingId: photo.id }, { fileName: ' ' }, { mimeType: 'image/heic' }, { sizeBytes: 0 }, { sizeBytes: 15000001 },
  { status: 'uploaded' }, { status: 'failed' }, { status: 'processing', error: {} }, { thumbnailUrl: null }, { contentUrl: undefined },
  { thumbnailUrl: `https://evil.example${photo.thumbnailUrl}` }, { thumbnailUrl: `//evil.example${photo.thumbnailUrl}` },
  { thumbnailUrl: `${photo.thumbnailUrl}?token=secret` }, { thumbnailUrl: `${photo.thumbnailUrl}#x` },
  { contentUrl: 'data:image/png;base64,abc' }, { thumbnailUrl: photo.contentUrl },
  ...[200, 600, 422.5].map((status) => ({ status: 'failed', error: { type: 'about:blank', title: 'Ошибка', status, code: 'FAILED', requestId: photo.id } })),
]) test(`Photo отклоняет ${JSON.stringify(patch)}`, () => expect(() => parsePhoto({ ...photo, ...patch }, id)).toThrow());

test('адреса фото допускают только точный путь и свой origin', () => {
  vi.stubGlobal('location', { origin: 'https://app.example' });
  expect(photoAddress(`https://app.example${photo.thumbnailUrl}`, id, photo.id, 'thumbnail')).toBe(photo.thumbnailUrl);
  for (const value of [null, ` ${photo.thumbnailUrl}`, `https://app.example@evil.example${photo.thumbnailUrl}`, `/other${photo.thumbnailUrl}`, photo.thumbnailUrl!.replace('/photos/', '/%70hotos/')]) {
    expect(photoAddress(value, id, photo.id, 'thumbnail')).toBeNull();
  }
});

test('Listing проверяет фото, их уникальность, лимит и данные', () => {
  for (const patch of [{ photos: Array(21).fill(photo) }, { photos: [photo, photo] }, { data: { deal: { price: '100' } } }]) {
    expect(() => parseListing({ ...detail, ...patch })).toThrow();
  }
  expect(parsePhoto({ ...photo, status: 'processing', thumbnailUrl: null }, id).status).toBe('processing');
  expect(parsePhoto({ ...photo, status: 'failed', error: { type: 'about:blank', title: 'Ошибка', status: 422, code: 'FAILED', requestId: photo.id } }, id).status).toBe('failed');
});

test('API передаёт FormData, cookie-политику и версию без Content-Type', async () => {
  const fetchMock = vi.fn().mockResolvedValue(response({ version: 3, photo })); vi.stubGlobal('fetch', fetchMock);
  const image = file(); const controller = new AbortController();
  expect(await photos.upload(id, image, 2, controller.signal)).toEqual({ version: 3, photo });
  const [url, options] = fetchMock.mock.calls[0]!;
  expect(url).toBe(`/api/v1/listings/${id}/photos`); expect(options.body).toBeInstanceOf(FormData);
  expect(options.body.get('expectedVersion')).toBe('2'); expect(options.body.get('file').name).toBe('room.jpg');
  expect(options.headers.has('Content-Type')).toBe(false);
  expect(options).toMatchObject({ method: 'POST', credentials: 'same-origin', redirect: 'error', signal: controller.signal });
  fetchMock.mockResolvedValue(response({ version: 4 }, 200));
  expect(await photos.remove(id, photo.id, 3)).toEqual({ version: 4 });
  expect(fetchMock.mock.calls[1]![0]).toBe(`/api/v1/listings/${id}/photos/${photo.id}?expectedVersion=3`);
  expect(fetchMock.mock.calls[1]![1].method).toBe('DELETE');
});

for (const value of [{ version: 2, photo }, { version: 0, photo }, { version: 3, photo: { ...photo, listingId: photo.id } }, null]) {
  test(`API отвергает ответ ${JSON.stringify(value)}`, async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(value)));
    await expect(photos.upload(id, file(), 2)).rejects.toMatchObject({ kind: 'invalid-response' });
  });
}

test('API проверяет ID и version до запроса', () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  expect(() => photos.upload('bad', file(), 1)).toThrow(); expect(() => photos.upload(id, file(), 0)).toThrow();
  expect(() => photos.remove(id, 'bad', 1)).toThrow(); expect(fetchMock).not.toHaveBeenCalled();
});

test('смешанный выбор сохраняет допустимые файлы и резервирует все 20 мест', async () => {
  vi.spyOn(listings, 'get').mockResolvedValue(overview());
  const pending = deferred<Awaited<ReturnType<typeof photos.upload>>>(); const upload = vi.spyOn(photos, 'upload').mockReturnValue(pending.promise);
  const value = manager(); await loaded(value);
  value.add([file('first.jpg'), new File(['x'], 'bad.heic', { type: 'image/heic' }), ...Array.from({ length: 19 }, (_, i) => file(`${i}.jpg`))]);
  expect(value.count()).toBe(20); expect(value.snapshot().uploads.filter((entry) => entry.state === 'rejected')).toHaveLength(2);
  expect(upload).toHaveBeenCalledOnce(); value.dismiss(value.snapshot().uploads[0]!.key); expect(value.count()).toBe(20);
  value.dismiss(value.snapshot().uploads[2]!.key); expect(value.count()).toBe(19);
});

test('загрузки и удаление сериализуются и передают подтверждённую version', async () => {
  const get = vi.spyOn(listings, 'get').mockResolvedValueOnce(overview());
  const pending = deferred<Awaited<ReturnType<typeof photos.upload>>>();
  const second = { ...photo, id: '70792597-4a2a-4ddb-9d00-c2340dd8c099' };
  const first = { ...photo, id: '70792597-4a2a-4ddb-9d00-c2340dd8c098' };
  get.mockResolvedValue({ ...overview(), version: 5, status: 'draft', photos: [first, second] });
  const upload = vi.spyOn(photos, 'upload').mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ version: 5, photo: second });
  const remove = vi.spyOn(photos, 'remove').mockResolvedValue({ version: 4 });
  const value = manager(); await loaded(value); value.add([file(), file('two.jpg')]); value.remove(photo.id); value.remove(photo.id);
  expect(remove).not.toHaveBeenCalled(); expect(upload).toHaveBeenCalledTimes(1);
  pending.resolve({ version: 3, photo: first });
  await vi.waitFor(() => expect(value.snapshot().listing!.version).toBe(5));
  expect(upload.mock.calls.map((call) => call[2])).toEqual([2, 4]); expect(remove.mock.calls[0]![2]).toBe(3); expect(remove).toHaveBeenCalledOnce();
  expect(value.snapshot().listing!.photos.map((entry) => entry.id)).not.toContain(photo.id);
  expect(get).toHaveBeenCalledTimes(2); expect(value.snapshot().error).toBeUndefined();
});

test('запоздалый GET завершается до удаления и не возвращает удалённое фото', async () => {
  const late = deferred<ReturnType<typeof overview>>(); const get = vi.spyOn(listings, 'get').mockResolvedValueOnce(overview()).mockReturnValueOnce(late.promise)
    .mockResolvedValue({ ...overview(), version: 3, status: 'draft', photos: [] });
  const remove = vi.spyOn(photos, 'remove').mockResolvedValue({ version: 3 }); const value = manager(); await loaded(value);
  value.refresh(); value.refresh(); value.remove(photo.id); expect(get).toHaveBeenCalledTimes(2); expect(remove).not.toHaveBeenCalled();
  late.resolve(overview()); await vi.waitFor(() => expect(value.snapshot().listing!.version).toBe(3));
  expect(value.snapshot().listing!.photos).toHaveLength(0);
});

for (const status of [401, 403, 404, 409, 413, 415, 422, 429, 503]) {
  test(`ошибка загрузки ${status}: остановка и явное продолжение`, async () => {
    const get = vi.spyOn(listings, 'get').mockResolvedValue(overview());
    const upload = vi.spyOn(photos, 'upload').mockRejectedValue(new RequestError('http', status));
    const recheck = vi.fn(); const value = manager(recheck); await loaded(value); value.add([file(), file('next.jpg')]);
    await vi.waitFor(() => expect(value.snapshot().paused).toBe(true));
    expect(upload).toHaveBeenCalledOnce(); expect(value.snapshot().listing!.photos).toHaveLength(1);
    if (status === 401) expect(recheck).toHaveBeenCalledWith(true);
    if ([401, 403].includes(status)) { expect(value.snapshot().inaccessible).toBe(true); expect(get).toHaveBeenCalledOnce(); }
    else { await loaded(value); expect(get).toHaveBeenCalledTimes(2); }
    expect(value.snapshot().uploads[0]!.state).toBe(status >= 500 ? 'uncertain' : 'error');
  });
}

test('неопределённый POST перечитывает сервер и не повторяет файл', async () => {
  const updated = overview(); updated.version = 3; updated.photos.push({ ...updated.photos[0]!, id: '70792597-4a2a-4ddb-9d00-c2340dd8c099' });
  const get = vi.spyOn(listings, 'get').mockResolvedValueOnce(overview()).mockResolvedValue(updated);
  const upload = vi.spyOn(photos, 'upload').mockRejectedValue(new RequestError('network'));
  const value = manager(); await loaded(value); value.add([file()]); await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2)); await loaded(value);
  value.resume(); expect(upload).toHaveBeenCalledOnce(); expect(value.snapshot().uploads[0]!.file).toBeUndefined(); expect(value.count()).toBe(2);
});

test('удаление с ошибкой сохраняет фото, ручное обновление восстанавливает доступ', async () => {
  const get = vi.spyOn(listings, 'get').mockResolvedValue(overview()); const remove = vi.spyOn(photos, 'remove').mockRejectedValueOnce(new RequestError('http', 422)).mockResolvedValue({ version: 3 });
  const value = manager(); await loaded(value); value.remove(photo.id); await vi.waitFor(() => expect(value.snapshot().paused).toBe(true)); await loaded(value);
  expect(value.snapshot().listing!.photos).toHaveLength(1);
  get.mockResolvedValue({ ...overview(), version: 3, status: 'draft', photos: [] }); value.resume(); value.remove(photo.id);
  await vi.waitFor(() => expect(value.snapshot().listing!.photos).toHaveLength(0)); expect(remove).toHaveBeenCalledTimes(2);
});

test('processing меняется без version, опрос прекращается после ready', async () => {
  vi.useFakeTimers(); const initial = overview(); initial.photos[0]!.status = 'processing'; initial.photos[0]!.thumbnailUrl = null;
  const get = vi.spyOn(listings, 'get').mockResolvedValueOnce(initial).mockResolvedValue(overview()); const value = manager();
  await vi.advanceTimersByTimeAsync(0); expect(value.snapshot().listing!.photos[0]!.status).toBe('processing');
  await vi.advanceTimersByTimeAsync(1500); expect(value.snapshot().listing!.photos[0]!.status).toBe('ready');
  expect(value.snapshot().listing!.version).toBe(2); await vi.advanceTimersByTimeAsync(15000); expect(get).toHaveBeenCalledTimes(2);
});

test('опрос не пересекается, не откатывает version и не выдумывает failed', async () => {
  vi.useFakeTimers(); const initial = overview(); initial.photos[0]!.status = 'processing';
  const pending = deferred<ReturnType<typeof overview>>(); const get = vi.spyOn(listings, 'get').mockResolvedValueOnce(initial).mockReturnValueOnce(pending.promise);
  const value = manager(); await vi.advanceTimersByTimeAsync(1500); await vi.advanceTimersByTimeAsync(120000);
  expect(get).toHaveBeenCalledTimes(2); expect(value.snapshot().listing!.photos[0]!.status).toBe('processing');
  pending.resolve({ ...overview(), version: 1 }); await vi.advanceTimersByTimeAsync(0);
  expect(value.snapshot().listing!.version).toBe(2); expect(value.snapshot().verified).toBe(false);
});

test('generating блокирует записи, refresh не возобновляет очередь автоматически', async () => {
  const get = vi.spyOn(listings, 'get').mockResolvedValue({ ...overview(), status: 'generating' });
  const upload = vi.spyOn(photos, 'upload'); const remove = vi.spyOn(photos, 'remove'); const value = manager(); await loaded(value);
  value.add([file()]); value.remove(photo.id); value.resume(); expect(upload).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
  get.mockResolvedValue(overview()); value.refresh(); await vi.waitFor(() => expect(value.snapshot().listing!.status).toBe('ready'));
  expect(value.snapshot().paused).toBe(true); value.resume(); expect(value.snapshot().paused).toBe(false);
});

test('уход отменяет запрос и не отправляет остаток очереди после позднего ответа', async () => {
  vi.spyOn(listings, 'get').mockResolvedValue(overview()); const pending = deferred<Awaited<ReturnType<typeof photos.upload>>>();
  const upload = vi.spyOn(photos, 'upload').mockReturnValue(pending.promise); const value = manager(); await loaded(value);
  value.add([file(), file()]); const before = value.snapshot(); value.stop();
  expect(upload.mock.calls[0]![3]!.aborted).toBe(true); pending.resolve({ version: 3, photo });
  await Promise.resolve(); await Promise.resolve(); expect(value.snapshot()).toBe(before); expect(upload).toHaveBeenCalledOnce();
  value.add([file()]); value.remove(photo.id); value.resume(); value.refresh(); expect(upload).toHaveBeenCalledOnce();
});

test('подтверждённое фото сохраняется при ошибке следующего файла', async () => {
  const get = vi.spyOn(listings, 'get').mockResolvedValueOnce(overview());
  const saved = { ...photo, id: '70792597-4a2a-4ddb-9d00-c2340dd8c099' };
  const current = { ...overview(), version: 3, photos: [photo, saved] }; get.mockResolvedValue(current);
  const upload = vi.spyOn(photos, 'upload').mockResolvedValueOnce({ version: 3, photo: saved }).mockRejectedValueOnce(new RequestError('http', 415));
  const value = manager(); await loaded(value); value.add([file('saved.jpg'), file('failed.jpg'), file('waiting.jpg')]);
  await vi.waitFor(() => expect(value.snapshot().paused).toBe(true)); await loaded(value);
  expect(value.snapshot().listing!.photos).toHaveLength(2); expect(value.snapshot().listing!.version).toBe(3); expect(upload).toHaveBeenCalledTimes(2);
  expect(value.snapshot().uploads.map((entry) => entry.name)).toEqual(['failed.jpg', 'waiting.jpg']);
});

test('остановка отменяет таймер опроса, поздний первоначальный GET игнорируется', async () => {
  vi.useFakeTimers(); const pending = deferred<ReturnType<typeof overview>>(); const get = vi.spyOn(listings, 'get').mockReturnValueOnce(pending.promise);
  const value = manager(); value.stop(); const before = value.snapshot(); pending.resolve(overview()); await vi.advanceTimersByTimeAsync(0);
  expect(value.snapshot()).toBe(before);
  const processing = overview(); processing.photos[0]!.status = 'processing'; get.mockResolvedValue(processing);
  const second = manager(); await vi.advanceTimersByTimeAsync(0); second.stop(); await vi.advanceTimersByTimeAsync(15000); expect(get).toHaveBeenCalledTimes(2);
});

test('после конфликта очередь учитывает фото из обновлённой карточки', async () => {
  const current = overview(); current.photos = Array.from({ length: 20 }, (_, index) => ({ ...photo, id: String(index) })); current.version = 3;
  vi.spyOn(listings, 'get').mockResolvedValueOnce(overview()).mockResolvedValue(current);
  vi.spyOn(photos, 'upload').mockRejectedValue(new RequestError('http', 409)); const value = manager(); await loaded(value); value.add([file(), file()]);
  await vi.waitFor(() => expect(value.snapshot().paused).toBe(true)); await loaded(value);
  expect(value.count()).toBe(20); expect(value.snapshot().uploads.every((entry) => entry.state === 'rejected')).toBe(true);
});

test('GET после ошибки можно повторить вручную; неверная мутация не меняет галерею', async () => {
  const get = vi.spyOn(listings, 'get').mockRejectedValueOnce(new RequestError('network')).mockResolvedValue(overview());
  const value = manager(); await vi.waitFor(() => expect(value.snapshot().error).toBeTruthy());
  expect(value.snapshot().verified).toBe(false); value.add([file()]); expect(value.snapshot().uploads).toHaveLength(0);
  value.refresh(); await loaded(value); value.resume();
  vi.spyOn(photos, 'upload').mockResolvedValue({ version: 3, photo });
  value.add([file()]); await vi.waitFor(() => expect(value.snapshot().uploads[0]!.state).toBe('uncertain'));
  expect(value.snapshot().listing!.photos).toHaveLength(1); expect(get).toHaveBeenCalledTimes(3);
});

for (const patch of [{ mimeType: ['image/jpeg'] }, { status: ['processing'] }]) {
  test(`строковые enum Photo не приводятся из массивов: ${JSON.stringify(patch)}`, async () => {
    const malformed = { ...photo, ...patch };
    expect(() => parsePhoto(malformed, id)).toThrow();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ ...detail, photos: [malformed] }, 200)).mockResolvedValueOnce(response({ version: 3, photo: malformed })));
    await expect(listings.get(id)).rejects.toMatchObject({ kind: 'invalid-response' });
    await expect(photos.upload(id, file(), 2)).rejects.toMatchObject({ kind: 'invalid-response' });
  });
}

for (const action of ['upload', 'delete'] as const) test(`после последней мутации ${action} перечитывает updatedAt без processing`, async () => {
  let server = overview(); const updatedAt = '2026-11-06T12:00:00Z';
  const get = vi.spyOn(listings, 'get').mockImplementation(async () => structuredClone(server));
  vi.spyOn(photos, 'remove').mockImplementation(async () => {
    server = { ...server, version: 3, updatedAt, photos: [], status: 'draft' }; return { version: 3 };
  });
  vi.spyOn(photos, 'upload').mockImplementation(async () => {
    const added = { ...photo, id: '70792597-4a2a-4ddb-9d00-c2340dd8c099' };
    server = { ...server, version: 3, updatedAt, photos: [...server.photos, added], status: 'draft' }; return { version: 3, photo: added };
  });
  const value = manager(); await loaded(value);
  if (action === 'upload') value.add([file()]); else value.remove(photo.id);
  await vi.waitFor(() => expect(value.snapshot().listing!.updatedAt).toBe(updatedAt));
  expect(get).toHaveBeenCalledTimes(2); expect(value.snapshot().listing!.version).toBe(3);
});

test('потерянный ответ DELETE восстанавливает удаление по GET и сообщает ID для фокуса', async () => {
  let server = overview(); vi.spyOn(listings, 'get').mockImplementation(async () => structuredClone(server));
  vi.spyOn(photos, 'remove').mockImplementation(async () => {
    server = { ...server, version: 3, photos: [], status: 'draft' }; throw new RequestError('network');
  });
  const value = manager(); await loaded(value); value.remove(photo.id);
  await vi.waitFor(() => expect(value.snapshot().listing!.photos).toHaveLength(0));
  expect(value.snapshot().removed).toBe(photo.id); expect(value.snapshot().verified).toBe(true);
});

test('ошибка завершающего GET не зацикливает запросы и не возвращает удалённое фото', async () => {
  vi.useFakeTimers(); const get = vi.spyOn(listings, 'get').mockResolvedValueOnce(overview()).mockRejectedValue(new RequestError('network'));
  vi.spyOn(photos, 'remove').mockResolvedValue({ version: 3 }); const value = manager(); await vi.advanceTimersByTimeAsync(0);
  value.remove(photo.id); await vi.advanceTimersByTimeAsync(0); await vi.advanceTimersByTimeAsync(15000);
  expect(get).toHaveBeenCalledTimes(2); expect(value.snapshot().listing!.photos).toEqual([]); expect(value.snapshot().listing!.version).toBe(3);
  expect(value.snapshot().paused).toBe(true); expect(value.snapshot().verified).toBe(false);
});

test('утрата доступа после частичного успеха не запускает завершающий GET', async () => {
  const get = vi.spyOn(listings, 'get').mockResolvedValue(overview());
  vi.spyOn(photos, 'upload').mockResolvedValueOnce({ version: 3, photo: { ...photo, id: '70792597-4a2a-4ddb-9d00-c2340dd8c099' } }).mockRejectedValueOnce(new RequestError('http', 403));
  const value = manager(); await loaded(value); value.add([file('saved.jpg'), file('denied.jpg')]);
  await vi.waitFor(() => expect(value.snapshot().inaccessible).toBe(true));
  expect(get).toHaveBeenCalledOnce(); expect(value.snapshot().listing!.photos).toHaveLength(2);
});
