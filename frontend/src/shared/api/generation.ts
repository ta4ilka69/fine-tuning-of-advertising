import { request } from './client';
import { isFieldIssue, isRecord } from './errors';
import { parseListing } from './listings';

export type Channel = { id: string; name: string; description: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const generation = {
  channels: (signal: AbortSignal) => request('/channels', {
    signal, status: 200, response: (value): Channel[] => {
      if (!isRecord(value) || !Array.isArray(value.items)) throw new TypeError();
      const channels = new Map<string, Channel>();
      for (const item of value.items) {
        if (!isRecord(item) || typeof item.id !== 'string' || !uuid.test(item.id)
          || typeof item.name !== 'string' || !item.name.trim() || typeof item.description !== 'string') throw new TypeError();
        channels.set(item.id.toLowerCase(), { id: item.id, name: item.name, description: item.description });
      }
      return [...channels.values()];
    },
  }),
  validate: (id: string, expectedVersion: number, signal: AbortSignal) => request(`/listings/${id}/validate`, {
    method: 'POST', body: { expectedVersion }, signal, status: 200, response: (value) => {
      if (!isRecord(value) || value.version !== expectedVersion || typeof value.canGenerate !== 'boolean'
        || !Array.isArray(value.errors) || !value.errors.every(isFieldIssue)
        || !Array.isArray(value.warnings) || !value.warnings.every(isFieldIssue)
        || value.canGenerate !== (value.errors.length === 0)) throw new TypeError();
      return { canGenerate: value.canGenerate, errors: value.errors, warnings: value.warnings };
    },
  }),
  start: (id: string, expectedVersion: number, channelIds: string[], signal: AbortSignal) => request(`/listings/${id}/generations`, {
    method: 'POST', body: { expectedVersion, channelIds: [...new Set(channelIds)] }, signal, status: 202, response: (value) => {
      const listing = parseListing(value);
      if (listing.id !== id || listing.version !== expectedVersion || listing.status !== 'generating') throw new TypeError();
      return listing;
    },
  }),
};
