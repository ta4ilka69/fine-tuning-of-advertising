import { afterEach, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { listings } from '../../src/shared/api/listings';
import { formatPrice, generationLabels } from '../../src/pages/account/format';
import { listing, listingItems, listingDetails, generationResult } from '../fixtures/listings';

const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());

test('фикстуры списка и карточки соответствуют OpenAPI', () => {
  const contract = JSON.parse(readFileSync('public/docs/openapi.json', 'utf8'));
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  ajv.addSchema({ $id: 'contract', components: contract.components });
  const validatePage = ajv.compile({ $ref: 'contract#/components/schemas/ListingPage' });
  expect(validatePage({ items: listingItems, nextCursor: 'opaque+/=' }), JSON.stringify(validatePage.errors)).toBe(true);
  const validateListing = ajv.compile({ $ref: 'contract#/components/schemas/Listing' });
  for (const item of listingItems) {
    const detail = listingDetails(item);
    expect(validateListing(detail), JSON.stringify(validateListing.errors)).toBe(true);
  }
});

test('передаёт непрозрачный cursor и limit, читает signal без повторов', async () => {
  const fetchMock = vi.fn().mockResolvedValue(response({ items: listingItems, nextCursor: null }));
  vi.stubGlobal('fetch', fetchMock);
  const controller = new AbortController();
  expect((await listings.page('opaque+/=&?', controller.signal)).items).toEqual(listingItems);
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, options] = fetchMock.mock.calls[0]!;
  expect(new URL(url, 'http://localhost').searchParams.get('cursor')).toBe('opaque+/=&?');
  expect(new URL(url, 'http://localhost').searchParams.get('limit')).toBe('20');
  expect(options).toMatchObject({ signal: controller.signal, credentials: 'same-origin', cache: 'no-store' });
});

for (const [field, invalid] of [
  ['id', 'bad'], ['version', 0], ['address', 7], ['dealType', 'long_term_rent'], ['dealType', 'short_term_rent'],
  ['objectType', 'apartments'], ['objectType', 'office'], ['price', { amount: '500', currency: 'RUB' }],
  ['price', 0], ['price', -1], ['price', 62000.5], ['price', Number.MAX_SAFE_INTEGER + 1], ['price', '500'],
  ['status', 'running'], ['status', 'succeeded'], ['status', null], ['hasResult', null], ['hasResult', 'true'],
  ['hasResult', false], ['createdAt', '2026-02-30T12:00:00Z'], ['createdAt', '2026-10-23T24:00:00Z'],
  ['createdAt', 'yesterday'], ['updatedAt', '2026-10-23'],
] as const) {
  test(`отклоняет некорректное поле ${field}=${JSON.stringify(invalid)}`, async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ items: [{ ...listing(), [field]: invalid }], nextCursor: null })));
    await expect(listings.page()).rejects.toMatchObject({ kind: 'invalid-response' });
  });
}
for (const field of ['objectType', 'price', 'status', 'hasResult']) {
  test(`отклоняет список без ${field}`, async () => {
    const item: Record<string, unknown> = listing();
    delete item[field];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ items: [item], nextCursor: null })));
    await expect(listings.page()).rejects.toMatchObject({ kind: 'invalid-response' });
  });
}
for (const value of [null, {}, { items: {} }, { items: [], nextCursor: '' }, { items: [], nextCursor: 2 }, { items: [null], nextCursor: null }]) {
  test(`отклоняет некорректную страницу ${JSON.stringify(value)}`, async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(value)));
    await expect(listings.page()).rejects.toMatchObject({ kind: 'invalid-response' });
  });
}

test('показывает целые рубли без округления и определяет период по сделке', () => {
  expect(formatPrice(listing({ price: Number.MAX_SAFE_INTEGER }))).toBe('9\u00a0007\u00a0199\u00a0254\u00a0740\u00a0991\u00a0₽');
  expect(formatPrice(listing({ price: 62000, dealType: 'rent' }))).toBe('62\u00a0000\u00a0₽ / мес.');
  expect(formatPrice(listing({ dealType: 'daily_rent' }))).toContain(' / сутки');
  expect(formatPrice(listing({ dealType: null }))).not.toContain('/');
  expect(formatPrice(listing({ price: null }))).toBe('Цена не указана');
});

for (const status of ['draft', 'generating', 'ready', 'failed'] as const) {
  for (const hasResult of [false, true]) {
    if (status === 'ready' && !hasResult) continue;
    test(`состояние ${status} с результатом ${hasResult} не выдумывает его актуальность`, async () => {
      const item = listing({ status, hasResult });
      const labels = generationLabels(item).map(({ text }) => text);
      expect(labels.includes('Результат готов')).toBe(status === 'ready');
      expect(labels.includes('Данные изменились')).toBe(status === 'draft' && hasResult);
      expect(labels.includes('Сохранённый результат')).toBe(hasResult && ['failed', 'generating'].includes(status));
      expect(labels.includes('Последний запуск: ошибка')).toBe(status === 'failed');
      expect(labels.includes('Генерация идёт')).toBe(status === 'generating');
      expect(labels.includes('Черновик')).toBe(status === 'draft' && !hasResult);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(listingDetails(item))));
      expect(await listings.get(item.id)).toMatchObject({ status, hasResult });
    });
  }
}

test('получает неполный черновик и сохраняет результат после неудачного запуска', async () => {
  const draft = listingDetails(listing({ status: 'draft', hasResult: false }));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ ...draft, data: {} }))
    .mockResolvedValueOnce(response(listingDetails(listing({ status: 'failed' })))));
  expect(await listings.get(draft.id)).toMatchObject({ address: null, objectType: null, price: null, hasResult: false });
  expect(await listings.get(draft.id)).toMatchObject({ status: 'failed', hasResult: true });
  expect(() => listings.get('../auth/me')).toThrow();
});

test('читает реальные примеры карточки из нового OpenAPI', async () => {
  const contract = JSON.parse(readFileSync('public/docs/openapi.json', 'utf8'));
  const examples = contract.paths['/listings/{id}'].get.responses['200'].content['application/json'].examples;
  for (const { value } of Object.values(examples) as { value: { id: string; status: string } }[]) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(value)));
    expect(await listings.get(value.id)).toMatchObject({ status: value.status, hasResult: true });
  }
});

for (const changes of [
  { data: null }, { data: { deal: null } }, { data: { object: null } }, { data: { location: null } },
  { data: { deal: { price: null } } }, { data: { object: { type: 'flat', isApartments: 'true' } } },
  { data: { object: { type: 'house', isApartments: true } } }, { photos: null },
  { result: {} }, { result: null }, { generationError: {} }, { status: 'failed', generationError: null },
  { status: 'failed', generationError: { status: 503 } }, { id: '70792597-4a2a-4ddb-9d00-c2340dd8c099' },
]) {
  test(`отклоняет некорректную карточку ${JSON.stringify(changes)}`, async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...listingDetails(), ...changes })));
    await expect(listings.get(listing().id)).rejects.toMatchObject({ kind: 'invalid-response' });
  });
}

const channel = generationResult.channels[0]!;
for (const [label, result] of [
  ['без площадок', { channels: [] }], ['некорректная площадка', { channels: [null] }],
  ['без версии площадки', { channels: [{ ...channel, channelVersionId: 'bad' }] }],
  ['без названия площадки', { channels: [{ ...channel, channel: { ...channel.channel, name: ' ' } }] }],
  ['повтор площадки', { channels: [channel, channel] }],
  ['пустой текст', { channels: [{ ...channel, text: ' ' }] }],
  ['неверная оценка', { channels: [{ ...channel, score: 101 }] }],
  ['дробная оценка', { channels: [{ ...channel, score: 0.5 }] }],
  ['без обоснования', { channels: [{ ...channel, scoreReason: '' }] }],
  ['неверное фото', { channels: [{ ...channel, photoIds: ['bad'] }] }],
  ['повтор фото', { channels: [{ ...channel, photoIds: [...channel.photoIds, ...channel.photoIds] }] }],
  ['слишком много фото', { channels: [{ ...channel, photoIds: Array(4).fill(channel.photoIds[0]) }] }],
] as const) {
  test(`не принимает некорректный результат: ${label}`, async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...listingDetails(), result })));
    await expect(listings.get(listing().id)).rejects.toMatchObject({ kind: 'invalid-response' });
  });
}

test('допускает пустую подборку и ссылки на удалённые фото в сохранённом результате', async () => {
  const result = { channels: [
    { ...channel, photoIds: [] },
    { ...channel, channel: { id: '70792597-4a2a-4ddb-9d00-c2340dd8c099', name: 'ЦИАН' } },
  ] };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...listingDetails(listing({ status: 'draft' })), photos: [], result })));
  expect(await listings.get(listing().id)).toMatchObject({ status: 'draft', hasResult: true });
});

test('апартаменты определяются по флагу квартиры', async () => {
  const detail = listingDetails();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...detail, data: { object: { type: 'flat', isApartments: true } } })));
  expect(await listings.get(detail.id)).toMatchObject({ objectType: 'flat', isApartments: true });
});

test('черновик с признаком апартаментов без типа объекта остаётся неполным', async () => {
  const detail = listingDetails(listing({ status: 'draft', hasResult: false }));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...detail, data: { object: { isApartments: true } } })));
  expect(await listings.get(detail.id)).toMatchObject({ objectType: null, isApartments: false });
});
