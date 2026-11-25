package com.adtune.backend.photo;

import com.adtune.backend.db.Photo;
import com.adtune.backend.db.PhotoImprovement;
import com.adtune.backend.db.PhotoQuality;
import com.adtune.backend.db.PhotoStatus;
import java.util.Map;
import java.util.UUID;

/**
 * Представление фотографии для фронтенда (см. parsePhoto в
 * frontend/src/shared/api/photos.ts): URL — строгие пути /api/v1/...,
 * при failed здесь должен быть валидный Problem.
 * Фронтенд читает quality и qualityReason (подпись к оценке в галерее);
 * qualityLabel, scene, description и improvement-поля — для будущих экранов
 * (валидатор фронта лишние поля пропускает). Все поля анализа есть только
 * у готовых фото, иначе null.
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
    String qualityLabel,
    String scene,
    String description,
    PhotoImprovement improvementType,
    String improvementLabel,
    String editInstruction,
    Map<String, Object> error) {

  public static PhotoView of(Photo photo) {
    boolean analyzed = photo.getStatus() == PhotoStatus.ready;
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
        analyzed ? photo.getQuality() : null,
        analyzed && photo.getQuality() != null ? photo.getQualityReason() : null,
        analyzed ? qualityLabel(photo) : null,
        analyzed ? photo.getScene() : null,
        analyzed ? photo.getDescription() : null,
        analyzed ? photo.getImprovementType() : null,
        analyzed ? improvementLabel(photo) : null,
        analyzed ? photo.getEditInstruction() : null,
        errorView(photo));
  }

  /** Ограниченный список оценок по-русски: плохое / среднее / хорошее. */
  private static String qualityLabel(Photo photo) {
    if (photo.getQuality() == null) {
      return null;
    }
    return switch (photo.getQuality()) {
      case good -> "хорошее";
      case needs_fix -> "среднее";
      case unfit -> "плохое";
    };
  }

  /** Название улучшения по-русски, например «почистить кадр». */
  private static String improvementLabel(Photo photo) {
    return photo.getImprovementType() == null ? null : photo.getImprovementType().getLabel();
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
