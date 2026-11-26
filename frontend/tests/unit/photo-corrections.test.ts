import { afterEach, expect, test, vi } from 'vitest';
import { PhotoManager, listingLocked } from '../../src/features/listing-photos/model';
import { listings, parseListing } from '../../src/shared/api/listings';
import { photoCorrections } from '../../src/shared/api/photo-corrections';
import { parsePhoto } from '../../src/shared/api/photos';
import { listingDetails } from '../fixtures/listings';
import { analysis, correctableListing, correctionId, correctedPhotoId, correctionsPath, failed, processing, ready, sourcePhoto } from '../fixtures/photo-corrections';

const raw = correctableListing();
const listing = parseListing(raw);
const managers: PhotoManager[] = [];
const state = async () => {
  const value = new PhotoManager(listing.id, vi.fn());
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
  const fetch = vi.fn().mockResolvedValueOnce(json({ ...raw, photoCorrection: processing() }, 202))
    .mockResolvedValueOnce(json(raw, 200));
  vi.stubGlobal('fetch', fetch);
  const signal = new AbortController().signal;
  const accepted = await photoCorrections.start(listing, sourcePhoto.id, 'clutter', correctionId, undefined, signal);
  expect(accepted.photoCorrection).toEqual(processing());
  expect(fetch.mock.calls[0]).toEqual([correctionsPath, expect.objectContaining({
    method: 'POST', credentials: 'same-origin', signal, cache: 'no-store',
    body: JSON.stringify({ expectedVersion: listing.version, improvementType: 'clutter', correctionId }),
  })]);
  await expect(photoCorrections.resolve(accepted, processing(), 'discard', signal)).resolves.toEqual(listing);
  expect(fetch.mock.calls[1]).toEqual([`${correctionsPath}/${correctionId}?expectedVersion=2`, expect.objectContaining({ method: 'DELETE', signal })]);
});

test('применение проверяет версию, замену слота и сохранение предыдущей генерации', async () => {
  const corrected = { ...sourcePhoto, id: correctedPhotoId,
    contentUrl: sourcePhoto.contentUrl.replace(sourcePhoto.id, correctedPhotoId),
    thumbnailUrl: sourcePhoto.thumbnailUrl.replace(sourcePhoto.id, correctedPhotoId) };
  const applied = { ...raw, version: 3, photos: [corrected], status: 'draft' };
  const fetch = vi.fn().mockResolvedValueOnce(json(applied, 200))
    .mockResolvedValueOnce(json({ ...applied, version: 2 }, 200))
    .mockResolvedValueOnce(json({ ...applied, photos: [sourcePhoto] }, 200))
    .mockResolvedValueOnce(json({ ...applied, photos: [] }, 200))
    .mockResolvedValueOnce(json({ ...applied, result: null }, 200));
  vi.stubGlobal('fetch', fetch);
  const signal = new AbortController().signal;
  const apply = () => photoCorrections.resolve({ ...listing, photoCorrection: ready() }, ready(), 'apply', signal);
  await expect(apply()).resolves.toMatchObject({ version: 3, status: 'draft', result: listing.result, photos: [{ id: correctedPhotoId }] });
  expect(fetch.mock.calls[0]).toEqual([`${correctionsPath}/${correctionId}/apply`, expect.objectContaining({
    method: 'POST', signal, body: '{"expectedVersion":2}',
  })]);
  for (let index = 0; index < 4; index++) await expect(apply()).rejects.toMatchObject({ kind: 'invalid-response' });
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
  const get = vi.spyOn(listings, 'get').mockResolvedValueOnce(listing).mockRejectedValueOnce(new TypeError())
    .mockResolvedValue({ ...listing, photoCorrection: ready() });
  const start = vi.spyOn(photoCorrections, 'start').mockRejectedValue(new TypeError());
  const manager = await state();
  await manager.changeCorrection('start', sourcePhoto.id);
  await vi.waitFor(() => expect(manager.snapshot().correction?.pollError).toBeTruthy());
  expect(listingLocked(manager.snapshot())).toBe(true);
  await manager.changeCorrection('start', sourcePhoto.id);
  expect(start).toHaveBeenCalledOnce();
  manager.refresh();
  await vi.waitFor(() => expect(manager.snapshot().listing?.photoCorrection).toEqual(ready()));
  expect(get).toHaveBeenCalledTimes(3);
});
