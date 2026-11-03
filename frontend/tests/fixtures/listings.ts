import type { ListingSummary } from '../../src/shared/api/types';

export const listing = (overrides: Partial<ListingSummary> = {}): ListingSummary => ({
  id: '70792597-4a2a-4ddb-9d00-c2340dd8c001', version: 2,
  address: 'Санкт-Петербург, Лесной проспект, 10', objectType: 'flat', dealType: 'sale',
  price: 9800000, status: 'ready', hasResult: true,
  createdAt: '2026-10-23T09:00:00Z', updatedAt: '2026-10-24T12:00:00Z', ...overrides,
});

export const listingItems = [
  listing(),
  listing({ id: '70792597-4a2a-4ddb-9d00-c2340dd8c002', address: null, objectType: null, dealType: null, price: null, status: 'draft', hasResult: false, createdAt: '2026-10-22T09:00:00Z' }),
  listing({ id: '70792597-4a2a-4ddb-9d00-c2340dd8c003', address: 'Санкт-Петербург, муниципальный округ Невская застава, улица Ольги Берггольц, 22, корпус 3', objectType: 'flat', dealType: 'rent', price: 62000, status: 'draft', createdAt: '2026-10-21T09:00:00Z' }),
  listing({ id: '70792597-4a2a-4ddb-9d00-c2340dd8c004', address: 'Большой проспект П. С., 72', objectType: 'room', dealType: 'daily_rent', price: 4500, status: 'failed', createdAt: '2026-10-20T09:00:00Z' }),
  listing({ id: '70792597-4a2a-4ddb-9d00-c2340dd8c005', address: 'Ленинградская область, Всеволожский район, деревня Новая, улица Центральная, 125', objectType: 'house', price: 999999999999999, status: 'generating', hasResult: false, createdAt: '2026-10-19T09:00:00Z' }),
];

export const generationResult = {
  channels: [{
    channelVersionId: 'f986b179-311a-4a11-b158-93a5608d0324',
    channel: { id: '9ad535e0-4826-4e1c-af12-96959dce03a8', name: 'Авито' },
    title: 'Квартира на Лесном проспекте', text: 'Квартира в Санкт-Петербурге.',
    score: 70, scoreReason: 'Указаны адрес, цена и тип объекта',
    photoIds: ['dcb3b59f-389a-46e7-b6fc-9f760ea02b91'],
  }],
};

export const generationError = {
  type: 'about:blank', title: 'Не удалось выполнить генерацию', status: 503,
  code: 'SERVICE_UNAVAILABLE', requestId: 'a6cdd08a-a252-48fa-a6c5-73f485bc494e',
};

export const listingDetails = (item = listing()) => ({
  id: item.id, version: item.version, status: item.status,
  data: {
    ...(item.dealType !== null || item.price !== null ? { deal: {
      ...(item.dealType !== null ? { type: item.dealType } : {}),
      ...(item.price !== null ? { price: item.price } : {}),
    } } : {}),
    ...(item.objectType !== null ? { object: { type: item.objectType } } : {}),
    ...(item.address !== null ? { location: { address: item.address } } : {}),
  },
  photos: [{
    id: 'dcb3b59f-389a-46e7-b6fc-9f760ea02b91', listingId: item.id,
    fileName: 'room.jpg', mimeType: 'image/jpeg', sizeBytes: 3000000, status: 'ready',
    contentUrl: `/api/v1/listings/${item.id}/photos/dcb3b59f-389a-46e7-b6fc-9f760ea02b91/content`,
    thumbnailUrl: `/api/v1/listings/${item.id}/photos/dcb3b59f-389a-46e7-b6fc-9f760ea02b91/thumbnail`, error: null,
  }],
  result: item.hasResult ? structuredClone(generationResult) : null,
  generationError: item.status === 'failed' ? generationError : null,
  createdAt: item.createdAt, updatedAt: item.updatedAt,
});
