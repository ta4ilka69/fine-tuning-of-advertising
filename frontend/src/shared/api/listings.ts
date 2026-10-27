import { request } from './client';
import { isRecord } from './errors';
import type { ListingPage, ListingSummary } from './types';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const positiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const timestamp = (value: unknown): value is string => {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    || !Number.isFinite(Date.parse(value))) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]! && Number(value.slice(11, 13)) < 24;
};

function parseSummary(value: unknown): ListingSummary {
  if (!isRecord(value) || typeof value.id !== 'string' || !uuid.test(value.id)
    || !positiveInteger(value.version)
    || !(value.address === null || typeof value.address === 'string')
    || ![null, 'sale', 'long_term_rent', 'short_term_rent'].includes(value.dealType as string | null)
    || ![null, 'flat', 'room', 'house', 'apartments'].includes(value.propertyType as string | null)
    || ![null, 'queued', 'running', 'succeeded', 'failed'].includes(value.latestGenerationStatus as string | null)
    || !(value.generatedForVersion === null || positiveInteger(value.generatedForVersion))
    || !timestamp(value.createdAt) || !timestamp(value.updatedAt)
    || !(value.price === null || (isRecord(value.price) && value.price.currency === 'RUB'
      && typeof value.price.amount === 'string' && /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(value.price.amount)
      && !/^0(?:\.0{1,2})?$/.test(value.price.amount)))) {
    throw new TypeError('Некорректное объявление');
  }
  return {
    id: value.id, version: value.version, address: value.address,
    dealType: value.dealType as ListingSummary['dealType'],
    propertyType: value.propertyType as ListingSummary['propertyType'],
    price: value.price === null ? null : { amount: (value.price as { amount: string }).amount, currency: 'RUB' },
    latestGenerationStatus: value.latestGenerationStatus as ListingSummary['latestGenerationStatus'],
    generatedForVersion: value.generatedForVersion, createdAt: value.createdAt, updatedAt: value.updatedAt,
  };
}

function parsePage(value: unknown): ListingPage {
  if (!isRecord(value) || !Array.isArray(value.items)
    || !(value.nextCursor === null || (typeof value.nextCursor === 'string' && value.nextCursor.length > 0))) {
    throw new TypeError('Некорректная страница объявлений');
  }
  return { items: value.items.map(parseSummary), nextCursor: value.nextCursor };
}

function parseListing(value: unknown): ListingSummary {
  if (!isRecord(value) || !isRecord(value.data)
    || !(value.latestGeneration === null || isRecord(value.latestGeneration))
    || !(value.lastSuccessfulGeneration === null || isRecord(value.lastSuccessfulGeneration))) {
    throw new TypeError('Некорректное объявление');
  }
  const { deal, property, location } = value.data;
  if ((deal !== undefined && !isRecord(deal)) || (property !== undefined && !isRecord(property))
    || (location !== undefined && !isRecord(location))) throw new TypeError('Некорректные данные объекта');
  return parseSummary({
    id: value.id, version: value.version, createdAt: value.createdAt, updatedAt: value.updatedAt,
    address: isRecord(location) ? location.address ?? null : null,
    dealType: isRecord(deal) ? deal.type ?? null : null,
    propertyType: isRecord(property) ? property.type ?? null : null,
    price: isRecord(deal) ? deal.price ?? null : null,
    latestGenerationStatus: value.latestGeneration === null ? null : value.latestGeneration.status,
    generatedForVersion: value.lastSuccessfulGeneration === null ? null : value.lastSuccessfulGeneration.sourceVersion,
  });
}

export const listings = {
  get: (id: string, signal?: AbortSignal) => {
    if (!uuid.test(id)) throw new TypeError('Некорректный ID объявления');
    return request(`/listings/${id}`, { signal, status: 200, response: (value) => {
      const item = parseListing(value);
      if (item.id !== id) throw new TypeError('Неожиданное объявление');
      return item;
    } });
  },
  page: (cursor?: string, signal?: AbortSignal) => request('/listings', {
    query: { limit: 20, cursor }, signal, status: 200, response: parsePage,
  }),
};
