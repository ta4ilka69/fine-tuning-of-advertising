import { afterEach, expect, test, vi } from 'vitest';
import { listingToForm, prepareListing } from '../../src/features/listing-form/model';
import { listings, parseListing } from '../../src/shared/api/listings';
import { PhotoManager } from '../../src/features/listing-photos/model';
import type { ListingData } from '../../src/shared/api/listing-data';
import { listingDetails } from '../fixtures/listings';

const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

for (const data of [
  {}, { deal: {}, object: {}, building: {}, house: { materialTypes: [] }, amenities: {}, rules: {}, legal: {}, location: { undergrounds: [] } },
  { deal: { deposit: 0, utilitiesIncluded: false }, object: { isApartments: false, roomsCount: 0 }, building: { hasConcierge: false }, house: { materialTypes: [] }, legal: { hasRedevelopment: false }, amenities: { hasTv: false }, rules: { petsAllowed: false }, location: { undergrounds: [] } },
  { location: { address: '  Сохранённые пробелы  ', undergrounds: [{ name: ' Лесная ', minutes: 0 }] }, extra: '  Исходный текст  ' },
] satisfies ListingData[]) test(`редактирование не меняет неполный снимок ${JSON.stringify(data)}`, () => {
  expect(prepareListing(listingToForm(data), data).data).toEqual(data);
});

for (const deal of ['sale', 'rent', 'daily_rent'] as const) for (const object of ['flat', 'room', 'house'] as const) {
  test(`снимок, нули, false и очистка ${deal}/${object}`, () => {
    const data: ListingData = { deal: { type: deal, price: 200, ...(deal === 'sale' ? { mortgageAllowed: false } : { deposit: 0 }) }, object: { type: object, totalArea: 54, ...(object === 'flat' ? { roomsCount: 0, isApartments: false } : {}) }, ...(object === 'house' ? { house: { materialTypes: [] } } : { building: {} }), location: { address: 'Лесная', undergrounds: [] }, extra: 'Комментарий' };
    const values = listingToForm(data);
    expect(prepareListing(values, data).data).toEqual(data);
    values.fields.extra = ''; values.fields.deal_price = ''; values.fields.location_address = '';
    const result = prepareListing(values, data);
    expect(result.data.deal?.price).toBeUndefined(); expect(result.data.location?.address).toBeUndefined(); expect(result.data.extra).toBeUndefined();
    expect(result.errors).toEqual({});
    expect(result.data.deal).toMatchObject(deal === 'sale' ? { mortgageAllowed: false } : { deposit: 0 });
  });
}

test('смена типа исключает неприменимые поля, скрытые применимые сведения остаются', () => {
  const data: ListingData = { object: { type: 'flat', isApartments: true, roomsCount: 2, totalArea: 50 }, building: { floorsCount: 9 }, deal: { type: 'rent', deposit: 0 }, amenities: { hasTv: false } };
  const values = listingToForm(data); values.fields.object_type = 'house'; values.fields.deal_type = 'sale';
  expect(prepareListing(values, data).data).toEqual({ object: { type: 'house', totalArea: 50 }, deal: { type: 'sale' } });
  values.fields.object_type = ''; values.fields.deal_type = '';
  expect(prepareListing(values, data).data).toMatchObject({ object: { isApartments: true, roomsCount: 2 }, building: { floorsCount: 9 }, deal: { deposit: 0 }, amenities: { hasTv: false } });
});

test('полный проверенный снимок и PUT с исходной версией, без повторов', async () => {
  const detail = listingDetails(); const fetchMock = vi.fn().mockResolvedValue(response(detail)); vi.stubGlobal('fetch', fetchMock);
  expect(parseListing(detail)).toMatchObject({ data: detail.data, result: detail.result, generationError: null });
  const controller = new AbortController();
  expect(await listings.update(detail.id, detail.data, 2, controller.signal)).toMatchObject({ version: 2, updatedAt: detail.updatedAt, result: detail.result });
  const [url, options] = fetchMock.mock.calls[0]!;
  expect(url).toBe(`/api/v1/listings/${detail.id}`);
  expect(JSON.parse(options.body)).toEqual({ data: detail.data, expectedVersion: 2 });
  expect(options).toMatchObject({ method: 'PUT', credentials: 'same-origin', signal: controller.signal });
  for (const invalid of [{ ...detail, id: '70792597-4a2a-4ddb-9d00-c2340dd8c099' }, { ...detail, version: 1 }, { ...detail, data: { extra: null } }, {}]) {
    fetchMock.mockResolvedValueOnce(response(invalid)); await expect(listings.update(detail.id, detail.data, 2)).rejects.toMatchObject({ kind: 'invalid-response' });
  }
  fetchMock.mockResolvedValueOnce(response({}, 503)); await expect(listings.update(detail.id, detail.data, 2)).rejects.toMatchObject({ status: 503 });
  expect(fetchMock).toHaveBeenCalledTimes(6);
  expect(() => listings.update('bad', {}, 1)).toThrow(); expect(() => listings.update(detail.id, {}, 0)).toThrow();
});

test('редактирование блокирует мутации фото, прерывает фоновый GET и принимает только ответ PUT', async () => {
  const detail = listingDetails(); Object.assign(detail.photos[0]!, { status: 'processing', thumbnailUrl: null });
  vi.spyOn(listings, 'get').mockResolvedValue(parseListing(detail));
  const manager = new PhotoManager(detail.id, vi.fn()); manager.start();
  try {
    await vi.waitFor(() => expect(manager.snapshot().verified).toBe(true));
    expect(manager.beginEdit()).toMatchObject({ version: 2 });
    manager.add([new File(['jpeg'], 'room.jpg', { type: 'image/jpeg' })]); manager.remove(detail.photos[0]!.id); manager.resume();
    expect(manager.snapshot().uploads).toEqual([]); expect(manager.snapshot().deleting).toBeUndefined();
    let release!: (value: ReturnType<typeof parseListing>) => void;
    let oldSignal!: AbortSignal;
    vi.mocked(listings.get).mockImplementationOnce((_id, signal) => { oldSignal = signal!; return new Promise((resolve) => { release = resolve; }); });
    manager.refresh(); await vi.waitFor(() => expect(manager.snapshot().reading).toBe(true));
    const next = parseListing({ ...detail, version: 3, status: 'draft', data: { extra: 'Изменено' } });
    vi.spyOn(listings, 'update').mockResolvedValue(next);
    await manager.saveEdit(next.data, 2, new AbortController().signal);
    expect(oldSignal.aborted).toBe(true); release(parseListing(detail));
    await Promise.resolve(); expect(manager.snapshot().listing).toEqual(next);
    manager.endEdit(); expect(manager.snapshot().editing).toBe(false);
  } finally { manager.stop(); }
});

test('ручная сверка после фоновой генерации снимает паузу фото без автоматических записей', async () => {
  const detail = listingDetails();
  const get = vi.spyOn(listings, 'get').mockResolvedValue(parseListing(detail));
  const manager = new PhotoManager(detail.id, vi.fn()); manager.start();
  try {
    await vi.waitFor(() => expect(manager.snapshot().verified).toBe(true)); manager.beginEdit();
    get.mockResolvedValueOnce(parseListing({ ...detail, status: 'generating' })); manager.refresh();
    await vi.waitFor(() => expect(manager.snapshot().paused).toBe(true));
    expect(manager.snapshot().error).toBeDefined();
    await manager.reloadEdit(new AbortController().signal);
    expect(manager.snapshot()).toMatchObject({ paused: false, verified: true, editing: true, uploads: [] });
    expect(manager.snapshot().error).toBeUndefined();
    manager.endEdit(); expect(manager.snapshot().paused).toBe(false);
  } finally { manager.stop(); }
});
