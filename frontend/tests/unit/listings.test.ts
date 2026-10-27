import { afterEach, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { listings } from '../../src/shared/api/listings';
import { formatPrice, generationLabels } from '../../src/pages/account/format';
import { listing, listingItems, listingDetails, succeededGeneration, failedGeneration } from '../fixtures/listings';

const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());

test('фикстуры списка и карточки соответствуют OpenAPI', () => {
  const contract = JSON.parse(readFileSync('public/docs/openapi.json', 'utf8'));
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  ajv.addSchema({ $id: 'contract', components: contract.components });
  for (const [schema, value] of [['ListingPage', { items: listingItems, nextCursor: 'opaque+/=' }], ['Listing', listingDetails()], ['Listing', { ...listingDetails(), latestGeneration: failedGeneration, lastSuccessfulGeneration: succeededGeneration }]] as const) {
    const validate = ajv.compile({ $ref: `contract#/components/schemas/${schema}` });
    expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
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
  ['id', 'bad'], ['version', 0], ['address', 7], ['dealType', 'rent'], ['propertyType', 'office'],
  ['price', { amount: 500, currency: 'RUB' }], ['price', { amount: '0.00', currency: 'RUB' }],
  ['price', { amount: '01', currency: 'RUB' }], ['price', { amount: '2.001', currency: 'RUB' }],
  ['price', { amount: '3', currency: 'USD' }], ['latestGenerationStatus', 'done'],
  ['generatedForVersion', 0], ['createdAt', '2026-02-30T12:00:00Z'], ['createdAt', '2026-10-23T24:00:00Z'], ['createdAt', 'yesterday'], ['updatedAt', '2026-10-23'],
] as const) {
  test(`отклоняет некорректное поле ${field}=${JSON.stringify(invalid)}`, async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ items: [{ ...listing(), [field]: invalid }], nextCursor: null })));
    await expect(listings.page()).rejects.toMatchObject({ kind: 'invalid-response' });
  });
}
for (const value of [null, {}, { items: {} }, { items: [], nextCursor: '' }, { items: [], nextCursor: 2 }, { items: [null], nextCursor: null }]) {
  test(`отклоняет некорректную страницу ${JSON.stringify(value)}`, async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(value)));
    await expect(listings.page()).rejects.toMatchObject({ kind: 'invalid-response' });
  });
}

test('сохраняет каждую цифру суммы и определяет период только по сделке', () => {
  expect(formatPrice(listing({ price: { amount: '999999999999999999999.99', currency: 'RUB' } }))).toBe('999\u00a0999\u00a0999\u00a0999\u00a0999\u00a0999\u00a0999,99\u00a0₽');
  expect(formatPrice(listing({ dealType: 'long_term_rent' }))).toContain(' / мес.');
  expect(formatPrice(listing({ dealType: 'short_term_rent' }))).toContain(' / сутки');
  expect(formatPrice(listing({ dealType: null }))).not.toContain('/');
  expect(formatPrice(listing({ price: null }))).toBe('Цена не указана');
});
for (const latestGenerationStatus of [null, 'queued', 'running', 'succeeded', 'failed'] as const) {
  for (const generatedForVersion of [null, 1, 2]) {
    test(`последний запуск ${latestGenerationStatus} и успешный результат ${generatedForVersion} независимы`, () => {
      const labels = generationLabels(listing({ latestGenerationStatus, generatedForVersion })).map(({ text }) => text);
      expect(labels.includes('Результат готов')).toBe(generatedForVersion === 2);
      expect(labels.includes('Данные изменились')).toBe(generatedForVersion === 1);
      expect(labels.includes('Последний запуск: ошибка')).toBe(latestGenerationStatus === 'failed');
    });
  }
}

test('получает карточку по ID, понимает неполный черновик и успешный результат после ошибки', async () => {
  const detail = listingDetails();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ ...detail, data: {} })).mockResolvedValueOnce(response({ ...detail, latestGeneration: failedGeneration, lastSuccessfulGeneration: succeededGeneration })));
  expect(await listings.get(detail.id)).toMatchObject({ address: null, price: null });
  expect(await listings.get(detail.id)).toMatchObject({ latestGenerationStatus: 'failed', generatedForVersion: 2 });
  expect(() => listings.get('../auth/me')).toThrow();
});
for (const changes of [{ data: null }, { data: { deal: null } }, { latestGeneration: 3 }, { lastSuccessfulGeneration: {} }, { lastSuccessfulGeneration: { sourceVersion: 2, status: 'failed', result: null } }, { id: '70792597-4a2a-4ddb-9d00-c2340dd8c099' }]) {
  test(`отклоняет некорректную карточку ${JSON.stringify(changes)}`, async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...listingDetails(), ...changes })));
    await expect(listings.get(listing().id)).rejects.toMatchObject({ kind: 'invalid-response' });
  });
}


for (const [label, generation] of [
  ['без результата', { ...succeededGeneration, result: null }],
  ['без времени завершения', { ...succeededGeneration, completedAt: null }],
  ['чужое объявление', { ...succeededGeneration, listingId: '70792597-4a2a-4ddb-9d00-c2340dd8c099' }],
  ['без выбранных площадок', { ...succeededGeneration, channelIds: [] }],
  ['без текстов', { ...succeededGeneration, result: { ...succeededGeneration.result, channelResults: [] } }],
  ['пустой текст', { ...succeededGeneration, result: { ...succeededGeneration.result, channelResults: [{ ...succeededGeneration.result.channelResults[0], text: ' ' }] } }],
  ['неверная оценка', { ...succeededGeneration, result: { ...succeededGeneration.result, assessment: { score: 101, reasons: ['a', 'b', 'c'] } } }],
  ['мало причин', { ...succeededGeneration, result: { ...succeededGeneration.result, assessment: { score: 50, reasons: ['a'] } } }],
  ['без рекомендаций фото', { ...succeededGeneration, result: { ...succeededGeneration.result, photoRecommendations: [] } }],
  ['неверный rank', { ...succeededGeneration, result: { ...succeededGeneration.result, photoRecommendations: [{ ...succeededGeneration.result.photoRecommendations[0], rank: 2 }] } }],
] as const) {
  test(`не показывает готовность некорректного успешного запуска: ${label}`, async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...listingDetails(), lastSuccessfulGeneration: generation })));
    await expect(listings.get(listing().id)).rejects.toMatchObject({ kind: 'invalid-response' });
  });
}

for (const status of ['queued', 'running']) {
  test(`новый запуск ${status} сохраняет успешно полученный результат`, async () => {
    const pending = { ...succeededGeneration, status, completedAt: null, result: null };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...listingDetails(), latestGeneration: pending, lastSuccessfulGeneration: succeededGeneration })));
    expect(await listings.get(listing().id)).toMatchObject({ latestGenerationStatus: status, generatedForVersion: 2 });
  });
}

test('порядок рекомендаций не подменяет их rank', async () => {
  const generation = { ...succeededGeneration, result: { ...succeededGeneration.result, photoRecommendations: [
    { photoId: 'dcb3b59f-389a-46e7-b6fc-9f760ea02b92', rank: 2, reason: 'Общий вид' },
    ...succeededGeneration.result.photoRecommendations,
  ] } };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...listingDetails(), lastSuccessfulGeneration: generation })));
  expect(await listings.get(listing().id)).toMatchObject({ generatedForVersion: 2 });
});
