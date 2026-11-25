package com.adtune.backend.photo;

import com.adtune.backend.db.Photo;
import com.adtune.backend.db.PhotoQuality;
import com.adtune.backend.db.PhotoStatus;
import java.util.Map;
import java.util.UUID;

/**
 * Представление фотографии для фронтенда (см. parsePhoto в
 * frontend/src/shared/api/photos.ts): URL — строгие пути /api/v1/...,
 * при failed здесь должен быть валидный Problem.
 */
public record PhotoView(
    String id,
    String listingId,
    String fileName,
    String mimeType,
    long sizeBytes,
    String status,
    String contentUrl,
    String thumbnailUrl,
    PhotoQuality quality,
    String qualityReason,
    Map<String, Object> error) {

  public static PhotoView of(Photo photo) {
    PhotoQuality quality = photo.getStatus() == PhotoStatus.ready ? photo.getQuality() : null;
    return new PhotoView(
        photo.getId().toString(),
        photo.getListingId().toString(),
        photo.getFileName(),
        photo.getMimeType(),
        photo.getSizeBytes(),
        photo.getStatus().name(),
        "/api/v1/listings/" + photo.getListingId() + "/photos/" + photo.getId() + "/content",
        photo.getThumbnailS3Key() == null ? null
            : "/api/v1/listings/" + photo.getListingId() + "/photos/" + photo.getId() + "/thumbnail",
        quality,
        quality == null ? null : photo.getQualityReason(),
        errorView(photo));
  }

  /** При failed фронтенд ждёт здесь валидный Problem; код — как в их e2e-моке. */
  private static Map<String, Object> errorView(Photo photo) {
    if (photo.getStatus() != PhotoStatus.failed || photo.getError() == null) {
      return null;
    }
    return Map.of(
        "type", "about:blank",
        "title", photo.getError(),
        "status", 422,
        "code", "PHOTO_PROCESSING_FAILED",
        "requestId", UUID.randomUUID().toString());
  }
}
