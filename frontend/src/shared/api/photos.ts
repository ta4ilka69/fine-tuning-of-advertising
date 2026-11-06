import { request } from './client';
import { isRecord, parseProblem } from './errors';
import type { Photo, PhotoMutation } from './types';

export const isUUID = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const positiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

export function photoAddress(value: unknown, listingId: string, photoId: string, kind: 'content' | 'thumbnail') {
  if (typeof value !== 'string' || value.trim() !== value) return null;
  const path = `/api/v1/listings/${listingId}/photos/${photoId}/${kind}`;
  if (value === path) return path;
  if (typeof location !== 'undefined' && value === `${location.origin}${path}`) return path;
  return null;
}

export function parsePhoto(value: unknown, listingId: string): Photo {
  if (!isRecord(value) || !isUUID(value.id) || value.listingId !== listingId
    || typeof value.fileName !== 'string' || !/\S/.test(value.fileName)
    || !['image/jpeg', 'image/png'].includes(String(value.mimeType))
    || !positiveInteger(value.sizeBytes) || value.sizeBytes > 15000000
    || !['processing', 'ready', 'failed'].includes(String(value.status))) throw new TypeError('Некорректная фотография');
  const contentUrl = photoAddress(value.contentUrl, listingId, value.id, 'content');
  const thumbnailUrl = photoAddress(value.thumbnailUrl, listingId, value.id, 'thumbnail');
  const error = value.status === 'failed' && isRecord(value.error) && typeof value.error.status === 'number'
    && Number.isInteger(value.error.status) && value.error.status >= 400 && value.error.status <= 599
    ? parseProblem(value.error, value.error.status) : null;
  if ((value.contentUrl !== null && !contentUrl) || (value.thumbnailUrl !== null && !thumbnailUrl)
    || (value.status === 'ready' && (!contentUrl || !thumbnailUrl))
    || (value.status === 'failed' ? !error : value.error !== null)) throw new TypeError('Некорректная фотография');
  return {
    id: value.id, listingId, fileName: value.fileName, mimeType: value.mimeType as Photo['mimeType'],
    sizeBytes: value.sizeBytes, status: value.status as Photo['status'], contentUrl, thumbnailUrl, error: error || null,
  };
}

function validateMutation(listingId: string, expectedVersion: number, photoId?: string) {
  if (!isUUID(listingId) || !positiveInteger(expectedVersion) || (photoId !== undefined && !isUUID(photoId))) {
    throw new TypeError('Некорректный запрос фотографий');
  }
}

function parseVersion(value: unknown, expectedVersion: number) {
  if (!isRecord(value) || !positiveInteger(value.version) || value.version <= expectedVersion) {
    throw new TypeError('Некорректная версия объявления');
  }
  return value.version;
}

export const photos = {
  upload: (id: string, file: File, expectedVersion: number, signal?: AbortSignal) => {
    validateMutation(id, expectedVersion);
    const body = new FormData();
    body.append('file', file);
    body.append('expectedVersion', String(expectedVersion));
    return request(`/listings/${id}/photos`, { method: 'POST', body, signal, status: 201, response: (value): PhotoMutation => ({
      version: parseVersion(value, expectedVersion), photo: parsePhoto((value as Record<string, unknown>).photo, id),
    }) });
  },
  remove: (id: string, photoId: string, expectedVersion: number, signal?: AbortSignal) => {
    validateMutation(id, expectedVersion, photoId);
    return request(`/listings/${id}/photos/${photoId}`, {
      method: 'DELETE', query: { expectedVersion }, signal, status: 200,
      response: (value) => ({ version: parseVersion(value, expectedVersion) }),
    });
  },
};
