import { request } from './client';
import { isRecord, parseProblem } from './errors';
import type { ListingOverview, ListingPage, ListingSummary } from './types';

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
    || ![null, 'sale', 'rent', 'daily_rent'].includes(value.dealType as string | null)
    || ![null, 'flat', 'room', 'house'].includes(value.objectType as string | null)
    || !['draft', 'generating', 'ready', 'failed'].includes(value.status as string)
    || typeof value.hasResult !== 'boolean' || (value.status === 'ready' && !value.hasResult)
    || !timestamp(value.createdAt) || !timestamp(value.updatedAt)
    || !(value.price === null || positiveInteger(value.price))) {
    throw new TypeError('Некорректное объявление');
  }
  return {
    id: value.id, version: value.version, address: value.address,
    dealType: value.dealType as ListingSummary['dealType'],
    objectType: value.objectType as ListingSummary['objectType'],
    price: value.price, status: value.status as ListingSummary['status'],
    hasResult: value.hasResult, createdAt: value.createdAt, updatedAt: value.updatedAt,
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

function isGenerationResult(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.channels) || value.channels.length < 1) return false;
  const channelIds = new Set<string>();
  return value.channels.every((channel) => {
    if (!isRecord(channel) || !isUUID(channel.channelVersionId)
      || !isRecord(channel.channel) || !isUUID(channel.channel.id) || !hasText(channel.channel.name)
      || channelIds.has(channel.channel.id) || !hasText(channel.title) || !hasText(channel.text)
      || !Number.isInteger(channel.score) || Number(channel.score) < 0 || Number(channel.score) > 100
      || !hasText(channel.scoreReason) || !Array.isArray(channel.photoIds) || channel.photoIds.length > 3
      || !channel.photoIds.every(isUUID) || new Set(channel.photoIds).size !== channel.photoIds.length) return false;
    channelIds.add(channel.channel.id);
    return true;
  });
}

function dataField(block: Record<string, unknown> | undefined, key: string) {
  const value = block?.[key];
  if (value === null) throw new TypeError('Некорректные данные объекта');
  return value ?? null;
}

function parseListing(value: unknown): ListingOverview {
  if (!isRecord(value) || !isRecord(value.data) || !Array.isArray(value.photos)
    || !(value.result === null || isGenerationResult(value.result))
    || (value.status === 'failed' ? !isRecord(value.generationError)
      || typeof value.generationError.status !== 'number'
      || !parseProblem(value.generationError, value.generationError.status) : value.generationError !== null)) {
    throw new TypeError('Некорректное объявление');
  }
  const { deal, object, location } = value.data;
  if ((deal !== undefined && !isRecord(deal)) || (object !== undefined && !isRecord(object))
    || (location !== undefined && !isRecord(location))
    || (isRecord(object) && object.isApartments !== undefined
      && (typeof object.isApartments !== 'boolean' || (object.type !== undefined && object.type !== 'flat')))) {
    throw new TypeError('Некорректные данные объекта');
  }
  return {
    ...parseSummary({
      id: value.id, version: value.version, createdAt: value.createdAt, updatedAt: value.updatedAt,
      address: dataField(location, 'address'), dealType: dataField(deal, 'type'),
      objectType: dataField(object, 'type'), price: dataField(deal, 'price'),
      status: value.status, hasResult: value.result !== null,
    }),
    isApartments: isRecord(object) && object.type === 'flat' && object.isApartments === true,
  };
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
