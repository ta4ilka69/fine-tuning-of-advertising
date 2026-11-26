import { request } from './client';
import { isRecord, parseProblem } from './errors';
import type { ChannelResult, GenerationResult, Listing, ListingPage, ListingSummary } from './types';
import { parsePhoto, parsePhotoCorrection } from './photos';
import type { ListingData } from './listing-data';
import { isListingData } from './validate-listing-data';

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
const isScore = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;

function parseGenerationResult(value: unknown): GenerationResult {
  if (!isRecord(value) || !Array.isArray(value.channels) || value.channels.length < 1) {
    throw new TypeError('Некорректный результат генерации');
  }
  const channelIds = new Set<string>();
  const channels = value.channels.map((channel: unknown): ChannelResult => {
    if (!isRecord(channel) || !isUUID(channel.channelVersionId)
      || !isRecord(channel.channel) || !isUUID(channel.channel.id) || !hasText(channel.channel.name)
      || channelIds.has(channel.channel.id) || !hasText(channel.title) || !hasText(channel.text)
      || !isScore(channel.score)
      || !hasText(channel.scoreReason) || !Array.isArray(channel.photoIds) || channel.photoIds.length > 3
      || !channel.photoIds.every(isUUID) || new Set(channel.photoIds).size !== channel.photoIds.length) {
      throw new TypeError('Некорректный результат генерации');
    }
    channelIds.add(channel.channel.id);
    const { channelVersionId, title, text, score, scoreReason, photoIds, photos } = channel;
    const top = isRecord(photos) && Array.isArray(photos.top) ? photos.top.filter(
      (photo: unknown): photo is NonNullable<ChannelResult['photos']>['top'][number] =>
        isRecord(photo) && isUUID(photo.photo_id) && hasText(photo.why),
    ).map(({ photo_id, why }) => ({ photo_id, why })) : undefined;
    return {
      channelVersionId, channel: { id: channel.channel.id, name: channel.channel.name },
      title, text, score, scoreReason, photoIds, photos: top && { top },
    };
  });
  const why = Array.isArray(value.why) ? value.why.filter(
    (reason: unknown): reason is NonNullable<GenerationResult['why']>[number] =>
      isRecord(reason) && typeof reason.plus === 'boolean' && hasText(reason.text),
  ).map(({ plus, text }) => ({ plus, text })) : undefined;
  return { channels, score: isScore(value.score) ? value.score : undefined, why };
}

function dataField(block: Record<string, unknown> | undefined, key: string) {
  const value = block?.[key];
  if (value === null) throw new TypeError('Некорректные данные объекта');
  return value ?? null;
}

export function parseListing(value: unknown): Listing {
  if (!isRecord(value) || !isListingData(value.data) || !Array.isArray(value.photos) || value.photos.length > 20
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
  const parsedPhotos = value.photos.map((photo) => parsePhoto(photo, String(value.id)));
  if (new Set(parsedPhotos.map((photo) => photo.id)).size !== parsedPhotos.length) throw new TypeError('Повтор фотографии');
  return {
    ...parseSummary({
      id: value.id, version: value.version, createdAt: value.createdAt, updatedAt: value.updatedAt,
      address: dataField(location, 'address'), dealType: dataField(deal, 'type'),
      objectType: dataField(object, 'type'), price: dataField(deal, 'price'),
      status: value.status, hasResult: value.result !== null,
    }),
    isApartments: isRecord(object) && object.type === 'flat' && object.isApartments === true,
    photos: parsedPhotos, data: value.data, result: value.result === null ? null : parseGenerationResult(value.result),
    generationError: value.generationError === null ? null : parseProblem(value.generationError, Number((value.generationError as Record<string, unknown>).status))!,
    ...(value.photoCorrection !== undefined && { photoCorrection: value.photoCorrection === null
      ? null : parsePhotoCorrection(value.photoCorrection, String(value.id), parsedPhotos) }),
  };
}

export type ListingFilters = { q?: string; from?: string; to?: string };

export const listings = {
  remove: (id: string, expectedVersion: number, signal?: AbortSignal) => {
    if (!uuid.test(id) || !positiveInteger(expectedVersion)) throw new TypeError('Некорректное объявление');
    return request(`/listings/${id}`, { method: 'DELETE', query: { expectedVersion }, signal, status: 204, response: 'empty' });
  },
  update: (id: string, data: ListingData, expectedVersion: number, signal?: AbortSignal) => {
    if (!uuid.test(id) || !positiveInteger(expectedVersion) || !isListingData(data)) throw new TypeError('Некорректное объявление');
    return request(`/listings/${id}`, { method: 'PUT', body: { data, expectedVersion }, signal, status: 200, response: (value) => {
      const item = parseListing(value);
      if (item.id !== id || item.version < expectedVersion) throw new TypeError('Неожиданное объявление');
      return item;
    } });
  },
  get: (id: string, signal?: AbortSignal) => {
    if (!uuid.test(id)) throw new TypeError('Некорректный ID объявления');
    return request(`/listings/${id}`, { signal, status: 200, response: (value) => {
      const item = parseListing(value);
      if (item.id !== id) throw new TypeError('Неожиданное объявление');
      return item;
    } });
  },
  page: (cursor?: string, signal?: AbortSignal, filters: ListingFilters = {}) => request('/listings', {
    query: { limit: 20, cursor, ...filters }, signal, status: 200, response: parsePage,
  }),
};
