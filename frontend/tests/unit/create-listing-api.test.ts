import { afterEach, expect, test, vi } from 'vitest';
import { createListing } from '../../src/shared/api/create-listing';
import { listingDetails, listing } from '../fixtures/listings';

const response = (body: unknown, status = 201) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const draft = () => ({ ...listingDetails(listing({ status: 'draft', hasResult: false })), data: {}, photos: [] });
afterEach(() => vi.unstubAllGlobals());

test('POST создаёт неполный черновик, проверяет 201 и Listing, не выполняет повторов', async () => {
  const controller = new AbortController();
  const fetch = vi.fn().mockResolvedValue(response(draft())); vi.stubGlobal('fetch', fetch);
  const result = await createListing({ data: {} }, controller.signal);
  expect(result).toMatchObject({ id: draft().id, data: {}, status: 'draft' });
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]![0]).toBe('/api/v1/listings');
  expect(fetch.mock.calls[0]![1]).toMatchObject({ method: 'POST', body: '{"data":{}}', signal: controller.signal, credentials: 'same-origin', redirect: 'error' });
});

test('невалидные данные не отправляются', () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  expect(() => createListing({ data: { deal: { price: 0 } } })).toThrow(); expect(fetch).not.toHaveBeenCalled();
});

for (const item of [
  { ...draft(), id: 'wrong' }, { ...draft(), data: null }, { ...draft(), data: { deal: { price: '5' } } },
  { ...draft(), data: { object: { type: 'room', isApartments: false } } }, { ...draft(), photos: [{}] },
  { ...draft(), result: undefined }, { ...draft(), generationError: undefined }, { ...draft(), version: 0 },
  { ...draft(), status: 'ready' }, { ...draft(), createdAt: 'not date' },
]) test(`некорректный Listing ${JSON.stringify(item)}`, async () => {
  const fetch = vi.fn().mockResolvedValue(response(item)); vi.stubGlobal('fetch', fetch);
  await expect(createListing({ data: {} })).rejects.toMatchObject({ kind: 'invalid-response' }); expect(fetch).toHaveBeenCalledOnce();
});

for (const status of [200, 202]) test(`ответ ${status} не считается созданием`, async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(draft(), status)));
  await expect(createListing({ data: {} })).rejects.toMatchObject({ kind: 'invalid-response' });
});

for (const field of ['id', 'listingId', 'fileName', 'mimeType', 'sizeBytes', 'status', 'contentUrl', 'thumbnailUrl', 'error']) test(`проверка фото ответа: ${field}`, async () => {
  const item = listingDetails();
  const photo: Record<string, unknown> = item.photos[0]!; delete photo[field];
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(item)));
  await expect(createListing({ data: {} })).rejects.toMatchObject({ kind: 'invalid-response' });
});

test('готовые, обрабатываемые и неудачные фото ответа проверяются', async () => {
  const item = listingDetails(); const fetch = vi.fn().mockImplementation(() => response(item)); vi.stubGlobal('fetch', fetch);
  expect((await createListing({ data: {} })).id).toBe(item.id);
  Object.assign(item.photos[0]!, { status: 'processing', contentUrl: null, thumbnailUrl: null });
  expect((await createListing({ data: {} })).id).toBe(item.id);
  Object.assign(item.photos[0]!, { status: 'failed', error: { type: 'about:blank', title: 'Ошибка', status: 500, code: 'FAIL', requestId: 'a6cdd08a-a252-48fa-a6c5-73f485bc494e' } });
  expect((await createListing({ data: {} })).id).toBe(item.id);
});
