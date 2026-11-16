import type { FieldIssue, Listing } from '../../shared/api/types';

export type GenerationState = {
  phase?: 'validating' | 'starting' | 'checking';
  reconciliation?: 'uncertain' | 'conflict' | 'busy' | 'unavailable';
  errors?: FieldIssue[];
  warnings?: FieldIssue[];
  message?: string;
  retryAt?: number;
  pollRetryAt?: number;
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

export function observedGeneration(current: Listing, previous: Listing | undefined) {
  if (current.status === 'generating') return true;
  if (current.version !== previous?.version || !['ready', 'failed'].includes(current.status)) return false;
  if (current.status !== previous.status) return true;
  if (current.status === 'failed') {
    const error = current.generationError;
    const previousError = previous.generationError;
    return error?.code !== previousError?.code || error?.title !== previousError?.title
      || error?.status !== previousError?.status || error?.detail !== previousError?.detail;
  }
  if (current.result?.score !== previous.result?.score
    || JSON.stringify(current.result?.why ?? []) !== JSON.stringify(previous.result?.why ?? [])) return true;
  const channels = current.result?.channels ?? [];
  const previousChannels = new Map(previous.result?.channels.map((result) => [result.channel.id, result]));
  return channels.length !== previousChannels.size || channels.some((result) => {
    const before = previousChannels.get(result.channel.id);
    return !before || result.channelVersionId !== before.channelVersionId || result.title !== before.title
      || result.text !== before.text || result.score !== before.score || result.scoreReason !== before.scoreReason
      || JSON.stringify(result.photos?.top ?? []) !== JSON.stringify(before.photos?.top ?? [])
      || result.photoIds.length !== before.photoIds.length || result.photoIds.some((id, index) => id !== before.photoIds[index]);
  });
}
