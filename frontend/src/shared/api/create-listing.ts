import { request } from './client';
import { isRecord } from './errors';
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
    if (!isRecord(value) || !isListingData(value.data)) throw new TypeError('Некорректное объявление');
    return { ...listing, data: value.data };
  } });
}
