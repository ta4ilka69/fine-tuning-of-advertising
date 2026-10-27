import type { ListingSummary } from '../../src/shared/api/types';

export const listing = (overrides: Partial<ListingSummary> = {}): ListingSummary => ({
  id: '70792597-4a2a-4ddb-9d00-c2340dd8c001', version: 2,
  address: 'Санкт-Петербург, Лесной проспект, 10', propertyType: 'flat', dealType: 'sale',
  price: { amount: '9800000', currency: 'RUB' }, latestGenerationStatus: 'succeeded', generatedForVersion: 2,
  createdAt: '2026-10-23T09:00:00Z', updatedAt: '2026-10-24T12:00:00Z', ...overrides,
});

export const listingItems = [
  listing(),
  listing({ id: '70792597-4a2a-4ddb-9d00-c2340dd8c002', address: null, propertyType: null, dealType: null, price: null, latestGenerationStatus: null, generatedForVersion: null, createdAt: '2026-10-22T09:00:00Z' }),
  listing({ id: '70792597-4a2a-4ddb-9d00-c2340dd8c003', address: 'Санкт-Петербург, муниципальный округ Невская застава, улица Ольги Берггольц, 22, корпус 3', propertyType: 'apartments', dealType: 'long_term_rent', price: { amount: '62000.50', currency: 'RUB' }, generatedForVersion: 1, createdAt: '2026-10-21T09:00:00Z' }),
  listing({ id: '70792597-4a2a-4ddb-9d00-c2340dd8c004', address: 'Большой проспект П. С., 72', propertyType: 'room', dealType: 'short_term_rent', price: { amount: '4500', currency: 'RUB' }, latestGenerationStatus: 'failed', createdAt: '2026-10-20T09:00:00Z' }),
  listing({ id: '70792597-4a2a-4ddb-9d00-c2340dd8c005', address: 'Ленинградская область, Всеволожский район, деревня Новая, улица Центральная, 125', propertyType: 'house', price: { amount: '999999999999999999999.99', currency: 'RUB' }, latestGenerationStatus: 'running', generatedForVersion: null, createdAt: '2026-10-19T09:00:00Z' }),
];

export const listingDetails = (item = listing()) => ({
  id: item.id, version: item.version,
  data: { deal: { type: item.dealType, price: item.price }, property: { type: item.propertyType }, location: { address: item.address } },
  photos: [], latestGeneration: null, lastSuccessfulGeneration: null, createdAt: item.createdAt, updatedAt: item.updatedAt,
});


export const succeededGeneration = {
  id: 'f986b179-311a-4a11-b158-93a5608d0324', listingId: listing().id, sourceVersion: 2,
  channelIds: ['9ad535e0-4826-4e1c-af12-96959dce03a8'], createdAt: '2026-10-24T11:00:00Z',
  status: 'succeeded', completedAt: '2026-10-24T11:00:10Z', error: null,
  result: {
    channelResults: [{ channelId: '9ad535e0-4826-4e1c-af12-96959dce03a8', channelRevision: 1, title: 'Квартира на Лесном проспекте', text: 'Квартира в Санкт-Петербурге.' }],
    assessment: { score: 70, reasons: ['Указан адрес', 'Указана цена', 'Указан тип объекта'] },
    photoRecommendations: [{ photoId: 'dcb3b59f-389a-46e7-b6fc-9f760ea02b91', rank: 1, reason: 'Общий вид комнаты' }],
  },
};

export const failedGeneration = {
  ...succeededGeneration, id: 'f986b179-311a-4a11-b158-93a5608d0325', status: 'failed', result: null,
  error: { type: 'about:blank', title: 'Не удалось выполнить генерацию', status: 503, code: 'SERVICE_UNAVAILABLE', requestId: 'a6cdd08a-a252-48fa-a6c5-73f485bc494e' },
};
