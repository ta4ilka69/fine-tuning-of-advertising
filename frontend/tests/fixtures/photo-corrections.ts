import type { PhotoCorrection } from '../../src/shared/api/types';
import { listingDetails } from './listings';

export const analysis = {
  quality: 'needs_fix',
  qualityLabel: 'среднее',
  qualityReason: 'Кружка на столике отвлекает внимание.',
  scene: 'Гостиная',
  description: 'Светлая гостиная с зелёным диваном, большим окном и круглым журнальным столиком.',
  improvementType: 'clutter',
  improvementLabel: 'почистить кадр',
  editInstruction: 'Убрать кружку с журнального столика.',
} as const;

export function correctableListing() {
  const listing = listingDetails();
  const photos: (typeof listing.photos[number] & Partial<typeof analysis>)[] =
    [{ ...listing.photos[0]!, fileName: 'Гостиная.jpg', ...analysis }];
  return {
    ...listing,
    photos,
    photoCorrection: null as PhotoCorrection | null,
    photoCorrectionRevision: 0,
  };
}

export const correctionId = '81e2736b-124b-4eac-9279-cea4de8ba542';
export const correctedPhotoId = '8e227e9a-29ca-4134-8c45-96c79a5e5741';
const listing = correctableListing();
export const sourcePhoto = listing.photos[0]!;
export const correctionsPath = `/api/v1/listings/${listing.id}/photos/${sourcePhoto.id}/corrections`;
export const previewUrl = (id: string) => `${correctionsPath}/${id}/preview`;
export const processing = (id = correctionId) => ({ id, photoId: sourcePhoto.id, improvementType: 'clutter', status: 'processing' } as const);
export const ready = (id = correctionId) => ({ ...processing(id), status: 'ready', previewUrl: previewUrl(id) } as const);
export const failed = (id = correctionId) => ({
  ...processing(id), status: 'failed',
  error: { type: 'about:blank', title: 'Не удалось исправить фото', status: 504, code: 'PHOTO_CORRECTION_TIMEOUT', requestId: id },
} as const);
