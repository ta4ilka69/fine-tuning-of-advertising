import { request } from './client';
import { parseListing } from './listings';
import { correctionPath } from './photos';
import type { Listing, PhotoCorrection, PhotoImprovement } from './types';

function correctionRevision(listing: Listing) {
  const revision = listing.photoCorrectionRevision;
  if (revision === undefined) throw new TypeError('Исправление фотографий недоступно');
  return revision;
}

export const photoCorrections = {
  start: (listing: Listing, photoId: string, improvementType: PhotoImprovement, correctionId: string,
    retryCorrectionId: string | undefined, signal: AbortSignal) => {
    const revision = correctionRevision(listing);
    return request(correctionPath(listing.id, photoId), {
      method: 'POST', status: 202, signal,
      body: { expectedVersion: listing.version, expectedCorrectionRevision: revision, improvementType, correctionId, retryCorrectionId },
      response: (value) => {
        const current = parseListing(value);
        if (current.id !== listing.id || current.version !== listing.version || current.photoCorrectionRevision !== revision + 1
          || current.photoCorrection?.id !== correctionId
          || current.photoCorrection.photoId !== photoId || current.photoCorrection.improvementType !== improvementType) {
          throw new TypeError('Неожиданное состояние исправления');
        }
        return current;
      },
    });
  },
  resolve: (listing: Listing, correction: PhotoCorrection, action: 'apply' | 'discard', signal: AbortSignal) => {
    const path = `${correctionPath(listing.id, correction.photoId)}/${correction.id}`;
    const apply = action === 'apply';
    const revision = correctionRevision(listing);
    return request(apply ? `${path}/apply` : path, {
      ...(apply ? { method: 'POST', body: { expectedVersion: listing.version } } as const
        : { method: 'DELETE', query: { expectedVersion: listing.version } } as const),
      signal, status: 200,
      response: (value) => {
        const current = parseListing(value);
        if (current.id !== listing.id || current.photoCorrection !== null || current.version !== listing.version + Number(apply)
          || current.photoCorrectionRevision !== revision + 1
          || current.photos.length !== listing.photos.length
          || current.photos.some((photo, index) => {
            const oldId = listing.photos[index]!.id;
            return apply && oldId === correction.photoId ? listing.photos.some((item) => item.id === photo.id) : photo.id !== oldId;
          })
          || (apply && (current.status !== 'draft' || (listing.result && !current.result)))) {
          throw new TypeError('Неожиданное состояние исправления');
        }
        return current;
      },
    });
  },
};
