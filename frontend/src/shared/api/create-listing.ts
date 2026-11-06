import { request } from './client';
import type { ListingData } from './listing-data';
import { parseListing } from './listings';
import { isListingData } from './validate-listing-data';
import type { Listing } from './types';

export type CreateListing = { data: ListingData };
export type CreatedListing = Listing;

export function createListing(body: CreateListing, signal?: AbortSignal) {
  if (!isListingData(body.data)) throw new TypeError('Некорректные данные объявления');
  return request('/listings', { method: 'POST', body, signal, status: 201, response: (value): CreatedListing => {
    return parseListing(value);
  } });
}
