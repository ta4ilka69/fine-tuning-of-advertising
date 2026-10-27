import { request } from './client';
import { isRecord, parseProblem } from './errors';
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

const hasText = (value: unknown): value is string => typeof value === 'string' && /\S/.test(value);
const isUUID = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);

function isGenerationResult(value: unknown, channelIds: string[]) {
  if (!isRecord(value) || !Array.isArray(value.channelResults) || value.channelResults.length !== channelIds.length
    || !value.channelResults.every((channel) => isRecord(channel) && isUUID(channel.channelId)
      && channelIds.includes(channel.channelId) && positiveInteger(channel.channelRevision)
      && hasText(channel.title) && hasText(channel.text))
    || new Set(value.channelResults.map((channel: Record<string, unknown>) => channel.channelId)).size !== channelIds.length
    || !isRecord(value.assessment) || !Number.isInteger(value.assessment.score)
    || Number(value.assessment.score) < 0 || Number(value.assessment.score) > 100
    || !Array.isArray(value.assessment.reasons) || value.assessment.reasons.length < 3 || !value.assessment.reasons.every(hasText)) return false;
  const photos = value.photoRecommendations;
  return Array.isArray(photos) && photos.length >= 1 && photos.length <= 3
    && photos.every((photo) => isRecord(photo) && isUUID(photo.photoId)
      && positiveInteger(photo.rank) && photo.rank <= photos.length && hasText(photo.reason))
    && new Set(photos.map((photo: Record<string, unknown>) => photo.photoId)).size === photos.length
    && new Set(photos.map((photo: Record<string, unknown>) => photo.rank)).size === photos.length;
}

function isGeneration(value: Record<string, unknown>, listingId: string) {
  if (!isUUID(value.id) || value.listingId !== listingId || !positiveInteger(value.sourceVersion)
    || !timestamp(value.createdAt) || !Array.isArray(value.channelIds) || value.channelIds.length < 1
    || !value.channelIds.every(isUUID) || new Set(value.channelIds).size !== value.channelIds.length) return false;
  if (value.status === 'succeeded') {
    return timestamp(value.completedAt) && value.error === null && isGenerationResult(value.result, value.channelIds);
  }
  if (value.status === 'queued' || value.status === 'running') {
    return value.completedAt === null && value.result === null && value.error === null;
  }
  return value.status === 'failed' && timestamp(value.completedAt) && value.result === null
    && isRecord(value.error) && typeof value.error.status === 'number'
    && Boolean(parseProblem(value.error, value.error.status));
}

function parseListing(value: unknown): ListingSummary {
  if (!isRecord(value) || !isRecord(value.data)
    || !(value.latestGeneration === null || isRecord(value.latestGeneration))
    || !(value.lastSuccessfulGeneration === null || isRecord(value.lastSuccessfulGeneration))) {
    throw new TypeError('Некорректное объявление');
  }
  if (typeof value.id !== 'string'
    || (value.latestGeneration !== null && !isGeneration(value.latestGeneration, value.id))
    || (value.lastSuccessfulGeneration !== null && (value.lastSuccessfulGeneration.status !== 'succeeded'
      || !isGeneration(value.lastSuccessfulGeneration, value.id)))) throw new TypeError('Некорректный результат генерации');
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
