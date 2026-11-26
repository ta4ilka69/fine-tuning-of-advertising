import { request } from './client';
import { isRecord, parseProblem } from './errors';
import type { Photo, PhotoCorrection, PhotoMutation } from './types';

export const isUUID = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const positiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

function sameOriginPath(value: unknown, path: string) {
  if (typeof value !== 'string' || value.trim() !== value) return null;
  if (value === path) return path;
  if (typeof location !== 'undefined' && value === `${location.origin}${path}`) return path;
  return null;
}

export function photoAddress(value: unknown, listingId: string, photoId: string, kind: 'content' | 'thumbnail') {
  return sameOriginPath(value, `/api/v1/listings/${listingId}/photos/${photoId}/${kind}`);
}

export function correctionPath(listingId: string, photoId: string) {
  return `/listings/${listingId}/photos/${photoId}/corrections`;
}

const optionalText = (value: unknown) => typeof value === 'string' ? value.trim() || null : null;

export function parsePhoto(value: unknown, listingId: string): Photo {
  if (!isRecord(value) || !isUUID(value.id) || value.listingId !== listingId
    || typeof value.fileName !== 'string' || !/\S/.test(value.fileName)
    || typeof value.mimeType !== 'string' || !['image/jpeg', 'image/png'].includes(value.mimeType)
    || !positiveInteger(value.sizeBytes) || value.sizeBytes > 15000000
    || typeof value.status !== 'string' || !['processing', 'ready', 'failed'].includes(value.status)) throw new TypeError('Некорректная фотография');
  const contentUrl = photoAddress(value.contentUrl, listingId, value.id, 'content');
  const thumbnailUrl = photoAddress(value.thumbnailUrl, listingId, value.id, 'thumbnail');
  const error = value.status === 'failed' && isRecord(value.error) && typeof value.error.status === 'number'
    && Number.isInteger(value.error.status) && value.error.status >= 400 && value.error.status <= 599
    ? parseProblem(value.error, value.error.status) : null;
  if ((value.contentUrl !== null && !contentUrl) || (value.thumbnailUrl !== null && !thumbnailUrl)
    || (value.status === 'ready' && (!contentUrl || !thumbnailUrl))
    || (value.status === 'failed' ? !error : value.error !== null)) throw new TypeError('Некорректная фотография');
  const { quality: rating, qualityReason: reason } = value;
  const quality = value.status === 'ready' && (rating === 'good' || rating === 'needs_fix' || rating === 'unfit') ? rating : null;
  const qualityReason = quality && typeof reason === 'string' ? reason.trim() || null : null;
  const analyzed = value.status === 'ready';
  const improvementType = analyzed && value.improvementType === 'clutter' ? value.improvementType : null;
  return {
    id: value.id, listingId, fileName: value.fileName, mimeType: value.mimeType as Photo['mimeType'],
    sizeBytes: value.sizeBytes, status: value.status as Photo['status'], contentUrl, thumbnailUrl, quality, qualityReason, error: error || null,
    ...(value.qualityLabel !== undefined && { qualityLabel: quality ? optionalText(value.qualityLabel) : null }),
    ...(value.scene !== undefined && { scene: analyzed ? optionalText(value.scene) : null }),
    ...(value.description !== undefined && { description: analyzed ? optionalText(value.description) : null }),
    ...(value.improvementType !== undefined && { improvementType }),
    ...(value.improvementLabel !== undefined && { improvementLabel: improvementType ? optionalText(value.improvementLabel) : null }),
    ...(value.editInstruction !== undefined && { editInstruction: improvementType ? optionalText(value.editInstruction) : null }),
  };
}

export function parsePhotoCorrection(value: unknown, listingId: string, photos: Photo[]): PhotoCorrection {
  if (isRecord(value) && isUUID(value.id) && isUUID(value.photoId) && value.improvementType === 'clutter'
    && photos.some((photo) => photo.id === value.photoId && photo.status === 'ready')) {
    const base = { id: value.id, photoId: value.photoId, improvementType: value.improvementType } as const;
    if (value.status === 'processing') return { ...base, status: value.status };
    if (value.status === 'ready') {
      const previewUrl = sameOriginPath(value.previewUrl, `/api/v1${correctionPath(listingId, value.photoId)}/${value.id}/preview`);
      if (previewUrl) return { ...base, status: value.status, previewUrl };
    }
    if (value.status === 'failed' && isRecord(value.error) && typeof value.error.status === 'number'
      && Number.isInteger(value.error.status) && value.error.status >= 400 && value.error.status <= 599) {
      const error = parseProblem(value.error, value.error.status);
      if (error) return { ...base, status: value.status, error };
    }
  }
  throw new TypeError('Некорректное состояние исправления фотографии');
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
