import { afterEach, expect, test, vi } from 'vitest';
import { PhotoManager, listingLocked } from '../../src/features/listing-photos/model';
import { listings, parseListing } from '../../src/shared/api/listings';
import { photoCorrections } from '../../src/shared/api/photo-corrections';
import { parsePhoto, photos } from '../../src/shared/api/photos';
import { RequestError } from '../../src/shared/api/errors';
import { listingDetails } from '../fixtures/listings';
import { analysis, correctableListing, correctionId, correctedPhotoId, correctionsPath, failed, processing, ready, sourcePhoto } from '../fixtures/photo-corrections';

const raw = correctableListing();
const listing = parseListing(raw);
const managers: PhotoManager[] = [];
const state = async (recheck = vi.fn()) => {
  const value = new PhotoManager(listing.id, recheck);
  managers.push(value);
  value.start();
  await vi.waitFor(() => expect(value.snapshot().verified).toBe(true));
  return value;
};
const json = (value: unknown, status: number) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => { managers.splice(0).forEach((value) => value.stop()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('старое фото, null и поля анализа', () => {
  const oldPhoto = parsePhoto(listingDetails().photos[0], listing.id);
  expect(oldPhoto).not.toHaveProperty('improvementType');
  expect(parsePhoto(sourcePhoto, listing.id)).toMatchObject(analysis);
  const empty = Object.fromEntries(Object.keys(analysis).map((key) => [key, null]));
  expect(parsePhoto({ ...sourcePhoto, ...empty }, listing.id)).toMatchObject(empty);
  expect(parsePhoto({ ...sourcePhoto, improvementType: 'unknown' }, listing.id)).toMatchObject({
    quality: 'needs_fix', improvementType: null, improvementLabel: null, editInstruction: null,
  });
  expect(parsePhoto({ ...sourcePhoto, status: 'processing' }, listing.id)).toMatchObject(empty);
  expect(parsePhoto({ ...sourcePhoto, qualityLabel: ' среднее ', description: ' ' }, listing.id))
    .toMatchObject({ qualityLabel: 'среднее', description: null });
});

test('снимок привязан к исходному фото и конкретному предпросмотру', () => {
  expect(parseListing(listingDetails()).photoCorrection).toBeUndefined();
  expect(parseListing(raw).photoCorrection).toBeNull();
  expect(() => parseListing({ ...raw, photoCorrectionRevision: undefined })).toThrow(TypeError);
  expect(() => parseListing({ ...raw, photoCorrectionRevision: -1 })).toThrow(TypeError);
  for (const photoCorrection of [processing(), ready(), failed()]) {
    expect(parseListing({ ...raw, photoCorrection }).photoCorrection).toEqual(photoCorrection);
  }
  for (const photoCorrection of [
    { ...ready(), previewUrl: `https://another.example${ready().previewUrl}` },
    { ...ready(), previewUrl: ready().previewUrl + '?v=1' },
    { ...ready(), photoId: correctionId },
    { ...ready(), status: 'invalid' },
    { ...failed(), error: { ...failed().error, status: 200 } },
  ]) expect(() => parseListing({ ...raw, photoCorrection })).toThrow(TypeError);
});

test('запуск и отказ используют общий API-клиент, версию и ID попытки', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json({ ...raw, photoCorrection: processing(), photoCorrectionRevision: 1 }, 202))
    .mockResolvedValueOnce(json({ ...raw, photoCorrectionRevision: 2 }, 200));
  vi.stubGlobal('fetch', fetch);
  const signal = new AbortController().signal;
  const accepted = await photoCorrections.start(listing, sourcePhoto.id, 'clutter', correctionId, undefined, signal);
  expect(accepted.photoCorrection).toEqual(processing());
  expect(fetch.mock.calls[0]).toEqual([correctionsPath, expect.objectContaining({
    method: 'POST', credentials: 'same-origin', signal, cache: 'no-store',
    body: JSON.stringify({ expectedVersion: listing.version, expectedCorrectionRevision: 0, improvementType: 'clutter', correctionId }),
  })]);
  await expect(photoCorrections.resolve(accepted, processing(), 'discard', signal)).resolves.toEqual({ ...listing, photoCorrectionRevision: 2 });
  expect(fetch.mock.calls[1]).toEqual([`${correctionsPath}/${correctionId}?expectedVersion=2`, expect.objectContaining({ method: 'DELETE', signal })]);
});

test('применение проверяет версию, замену слота и сохранение предыдущей генерации', async () => {
  const corrected = { ...sourcePhoto, id: correctedPhotoId,
    contentUrl: sourcePhoto.contentUrl.replace(sourcePhoto.id, correctedPhotoId),
    thumbnailUrl: sourcePhoto.thumbnailUrl.replace(sourcePhoto.id, correctedPhotoId) };
  const applied = { ...raw, version: 3, photos: [corrected], status: 'draft', photoCorrectionRevision: 2 };
  const fetch = vi.fn().mockResolvedValueOnce(json(applied, 200))
    .mockResolvedValueOnce(json({ ...applied, version: 2 }, 200))
    .mockResolvedValueOnce(json({ ...applied, photos: [sourcePhoto] }, 200))
    .mockResolvedValueOnce(json({ ...applied, photos: [] }, 200))
    .mockResolvedValueOnce(json({ ...applied, result: null }, 200))
    .mockResolvedValueOnce(json({ ...applied, status: 'generating' }, 200))
    .mockResolvedValueOnce(json({ ...applied, photoCorrectionRevision: 1 }, 200));
  vi.stubGlobal('fetch', fetch);
  const signal = new AbortController().signal;
  const apply = () => photoCorrections.resolve({ ...listing, photoCorrection: ready(), photoCorrectionRevision: 1 }, ready(), 'apply', signal);
  await expect(apply()).resolves.toMatchObject({ version: 3, status: 'draft', result: listing.result, photos: [{ id: correctedPhotoId }] });
  expect(fetch.mock.calls[0]).toEqual([`${correctionsPath}/${correctionId}/apply`, expect.objectContaining({
    method: 'POST', signal, body: '{"expectedVersion":2}',
  })]);
  for (let index = 0; index < 6; index++) await expect(apply()).rejects.toMatchObject({ kind: 'invalid-response' });
});

test('отмена запроса при уходе защищает новый снимок от запоздавшего ответа', async () => {
  const removed = { ...listing, version: 3, photos: [], photoCorrection: null };
  vi.spyOn(listings, 'get').mockResolvedValueOnce(listing).mockResolvedValue(removed);
  let resolve!: (value: typeof listing) => void;
  const started = vi.spyOn(photoCorrections, 'start').mockReturnValue(new Promise((done) => { resolve = done; }));
  const manager = await state();
  const committing = manager.changeCorrection('start', sourcePhoto.id);
  await manager.changeCorrection('start', sourcePhoto.id);
  expect(started).toHaveBeenCalledOnce();
  expect(listingLocked(manager.snapshot())).toBe(true);
  manager.stop();
  expect(started.mock.calls[0]![5].aborted).toBe(true);
  manager.start();
  await vi.waitFor(() => expect(manager.snapshot().listing).toEqual(removed));
  resolve({ ...listing, photoCorrection: processing() });
  await committing;
  expect(manager.snapshot().listing).toEqual(removed);
  expect(listingLocked(manager.snapshot())).toBe(false);
});

test('после потери ответа проверяется серверное состояние перед следующим действием', async () => {
  const start = vi.spyOn(photoCorrections, 'start').mockRejectedValue(new TypeError());
  const get = vi.spyOn(listings, 'get').mockResolvedValueOnce(listing).mockRejectedValueOnce(new TypeError())
    .mockImplementation(async () => ({ ...listing, photoCorrection: ready(start.mock.calls[0]![3]), photoCorrectionRevision: 1 }));
  const manager = await state();
  await manager.changeCorrection('start', sourcePhoto.id);
  await vi.waitFor(() => expect(manager.snapshot().correction?.pollError).toBeTruthy());
  expect(listingLocked(manager.snapshot())).toBe(true);
  await manager.changeCorrection('start', sourcePhoto.id);
  expect(start).toHaveBeenCalledOnce();
  manager.refresh();
  await vi.waitFor(() => expect(manager.snapshot().listing?.photoCorrection).toEqual(ready(start.mock.calls[0]![3])));
  expect(manager.snapshot().correction).toBeUndefined();
  expect(manager.snapshot().announcement).toBe('Исправленный вариант готов к сравнению.');
  expect(get).toHaveBeenCalledTimes(3);
});

test('после восстановления сессии исчезает ошибка доступа к исправлению', async () => {
  const active = { ...listing, photoCorrection: ready(), photoCorrectionRevision: 1 };
  vi.spyOn(listings, 'get').mockResolvedValue(active);
  vi.spyOn(photoCorrections, 'resolve').mockRejectedValueOnce(new RequestError('http', 401))
    .mockResolvedValue({ ...listing, photoCorrectionRevision: 2 });
  const recheck = vi.fn();
  const manager = await state(recheck);
  await manager.changeCorrection('discard', sourcePhoto.id, correctionId);
  expect(recheck).toHaveBeenLastCalledWith(true);
  expect(manager.snapshot()).toMatchObject({ inaccessible: true, correction: { accessError: expect.any(String) } });
  manager.stop();
  manager.start();
  await vi.waitFor(() => expect(manager.snapshot().verified).toBe(true));
  expect(manager.snapshot().correction).toBeUndefined();
  expect(manager.snapshot().error).toBeUndefined();
  await manager.changeCorrection('discard', sourcePhoto.id, correctionId);
  expect(manager.snapshot().listing?.photoCorrection).toBeNull();
});

test('снимок с прежней ревизией не восстанавливает завершённую попытку', async () => {
  const finished = { ...listing, photoCorrectionRevision: 2 };
  vi.spyOn(listings, 'get').mockResolvedValueOnce(finished)
    .mockResolvedValue({ ...listing, photoCorrection: ready(), photoCorrectionRevision: 1 });
  const manager = await state();
  await manager.refresh();
  expect(manager.snapshot().listing).toEqual(finished);
  expect(manager.snapshot().verified).toBe(false);
});

test('поздний запуск подтверждается после первого GET без изменений', async () => {
  const start = vi.spyOn(photoCorrections, 'start').mockRejectedValue(new RequestError('network'));
  vi.spyOn(listings, 'get').mockResolvedValueOnce(listing).mockResolvedValueOnce(listing)
    .mockImplementation(async () => ({ ...listing, photoCorrection: ready(start.mock.calls[0]![3]), photoCorrectionRevision: 1 }));
  const manager = await state();
  await manager.changeCorrection('start', sourcePhoto.id);
  await vi.waitFor(() => expect(manager.snapshot().correction?.phase).toBeUndefined());
  expect(manager.snapshot().correction?.message).toBeTruthy();
  expect(listingLocked(manager.snapshot())).toBe(false);
  await manager.refresh();
  expect(manager.snapshot().correction).toBeUndefined();
  expect(manager.snapshot().announcement).toBe('Исправленный вариант готов к сравнению.');
});

test.each(['applied', 'generating', 'deleted'] as const)('после потери ответа на применение сверяется состав галереи: %s', async (outcome) => {
  const active = { ...listing, photoCorrection: ready(), photoCorrectionRevision: 1 };
  const corrected = { ...listing.photos[0]!, id: correctedPhotoId };
  const final = { ...listing, version: 3, status: outcome === 'generating' ? 'generating' as const : 'draft' as const, photoCorrectionRevision: 2,
    photos: outcome === 'deleted' ? [] : [corrected] };
  vi.spyOn(photoCorrections, 'resolve').mockRejectedValue(new RequestError('network'));
  vi.spyOn(listings, 'get').mockResolvedValueOnce(active).mockResolvedValue(final);
  const manager = await state();
  await manager.changeCorrection('apply', sourcePhoto.id, correctionId);
  await vi.waitFor(() => expect(manager.snapshot().listing).toEqual(final));
  if (outcome !== 'deleted') {
    expect(manager.snapshot().correction).toBeUndefined();
    expect(manager.snapshot().announcement).toBe('Исправленная фотография применена.');
  } else {
    expect(manager.snapshot().correction?.message).toContain('Не удалось подтвердить действие');
    expect(manager.snapshot().announcement).not.toBe('Исправленная фотография применена.');
  }
});

test('401 при сверке исправления не оставляет ошибку очереди после входа', async () => {
  const active = { ...listing, photoCorrection: ready(), photoCorrectionRevision: 1 };
  vi.spyOn(listings, 'get').mockResolvedValueOnce(active).mockRejectedValueOnce(new RequestError('http', 401))
    .mockResolvedValue(active);
  const recheck = vi.fn();
  const manager = await state(recheck);
  await manager.refresh();
  expect(recheck).toHaveBeenLastCalledWith(true);
  expect(manager.snapshot()).toMatchObject({ inaccessible: true, correction: { accessError: expect.any(String) } });
  manager.stop();
  manager.start();
  await vi.waitFor(() => expect(manager.snapshot().verified).toBe(true));
  expect(manager.snapshot().correction).toBeUndefined();
  expect(manager.snapshot().error).toBeUndefined();
});

test('прерванная при выходе загрузка не блокирует исправление после восстановления', async () => {
  const active = { ...listing, photoCorrection: ready(), photoCorrectionRevision: 1 };
  vi.spyOn(listings, 'get').mockResolvedValueOnce(listing).mockResolvedValue(active);
  const upload = vi.spyOn(photos, 'upload').mockImplementation((_id, _file, _version, signal) => new Promise((_resolve, reject) => {
    signal!.addEventListener('abort', () => reject(new RequestError('aborted')), { once: true });
  }));
  const discard = vi.spyOn(photoCorrections, 'resolve').mockResolvedValue({ ...listing, photoCorrectionRevision: 2 });
  const manager = await state();
  manager.add(['Загрузка.jpg', 'Ожидает.jpg'].map((name) => new File(['jpeg'], name, { type: 'image/jpeg' })));
  expect(manager.snapshot().uploads[0]?.state).toBe('uploading');
  manager.stop();
  manager.start();
  await vi.waitFor(() => expect(manager.snapshot().listing).toEqual(active));
  expect(manager.snapshot().uploads.map(({ state, file }) => [state, !!file])).toEqual([['uncertain', false], ['waiting', true]]);
  await manager.changeCorrection('discard', sourcePhoto.id, correctionId);
  expect(discard).toHaveBeenCalledOnce();
  expect(manager.snapshot().listing?.photoCorrection).toBeNull();
  expect(manager.snapshot().paused).toBe(true);
  expect(upload).toHaveBeenCalledOnce();
});
