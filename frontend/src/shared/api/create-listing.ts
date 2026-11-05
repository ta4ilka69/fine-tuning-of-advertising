import { request } from './client';
import { isRecord, parseProblem } from './errors';
import type { ListingData } from './listing-data';
import { parseListing } from './listings';
import { isListingData } from './validate-listing-data';
import type { ListingOverview } from './types';

export type CreateListing = { data: ListingData };
export type CreatedListing = ListingOverview & { data: ListingData };

export function createListing(body: CreateListing, signal?: AbortSignal) {
  if (!isListingData(body.data)) throw new TypeError('Некорректные данные объявления');
  return request('/listings', { method: 'POST', body, signal, status: 201, response: (value): CreatedListing => {
    const listing = parseListing(value);
    if (!isRecord(value) || !isListingData(value.data) || !Array.isArray(value.photos) || value.photos.length > 20
      || !value.photos.every((photo) => isRecord(photo) && typeof photo.id === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(photo.id)
        && photo.listingId === listing.id && typeof photo.fileName === 'string' && /\S/.test(photo.fileName)
        && ['image/jpeg', 'image/png'].includes(String(photo.mimeType))
        && Number.isSafeInteger(photo.sizeBytes) && Number(photo.sizeBytes) >= 1 && Number(photo.sizeBytes) <= 15000000
        && ['processing', 'ready', 'failed'].includes(String(photo.status))
        && (photo.status === 'ready' ? typeof photo.contentUrl === 'string' && /\S/.test(photo.contentUrl)
          && typeof photo.thumbnailUrl === 'string' && /\S/.test(photo.thumbnailUrl)
          : [photo.contentUrl, photo.thumbnailUrl].every((url) => url === null || typeof url === 'string'))
        && (photo.status === 'failed' ? isRecord(photo.error) && typeof photo.error.status === 'number'
          && !!parseProblem(photo.error, photo.error.status) : photo.error === null))) throw new TypeError('Некорректное объявление');
    return { ...listing, data: value.data };
  } });
}
