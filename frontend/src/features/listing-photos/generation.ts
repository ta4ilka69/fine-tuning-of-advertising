import type { FieldIssue, Listing } from '../../shared/api/types';

export type GenerationState = {
  phase?: 'validating' | 'starting' | 'checking';
  errors?: FieldIssue[];
  warnings?: FieldIssue[];
  message?: string;
  retryAt?: number;
  pollError?: string;
};

export function photoRequirement(listing: Listing) {
  if (!listing.photos.length) return 'Добавьте хотя бы одну фотографию';
  if (listing.photos.some((photo) => photo.status === 'failed')) return 'Удалите фотографии с ошибкой и дождитесь обработки остальных';
  if (listing.photos.some((photo) => photo.status !== 'ready')) return 'Дождитесь обработки всех фотографий';
}

export function retainResult(current: Listing, previous: Listing | undefined): Listing {
  return (current.status === 'generating' || current.status === 'failed') && !current.result && previous?.result
    ? { ...current, hasResult: true, result: previous.result }
    : current;
}
