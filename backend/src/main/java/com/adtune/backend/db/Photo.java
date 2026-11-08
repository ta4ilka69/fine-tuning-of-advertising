package com.adtune.backend.db;

import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.Transient;
import org.springframework.data.domain.Persistable;
import org.springframework.data.relational.core.mapping.Table;

/**
 * Фотография объявления. Порядок фото — порядок загрузки, то есть по id
 * (UUID v7 растёт со временем). Оценку нейросеть ставит при загрузке;
 * до её завершения статус processing.
 */
@Table("photo")
public class Photo implements Persistable<UUID> {

  /** Новой сущность делает только фабрика; прочитанная из базы — не новая. */
  @Transient
  private boolean isNew;


  @Id
  private UUID id;
  private UUID listingId;
  private String s3Key;
  private String thumbnailS3Key;
  private String fileName;
  private String mimeType;
  private int sizeBytes;
  private PhotoStatus status;
  private String error;
  private PhotoQuality quality;
  private String qualityReason;
  private String scene;
  private OffsetDateTime createdAt;

  public static Photo uploaded(UUID listingId, String s3Key, String fileName,
      String mimeType, int sizeBytes) {
    Photo photo = new Photo();
    photo.id = UuidV7.generate();
    photo.listingId = listingId;
    photo.s3Key = s3Key;
    photo.fileName = fileName;
    photo.mimeType = mimeType;
    photo.sizeBytes = sizeBytes;
    photo.status = PhotoStatus.processing;
    photo.createdAt = OffsetDateTime.now();
    photo.isNew = true;
    return photo;
  }

  public UUID getId() {
    return id;
  }

  @Override
  public boolean isNew() {
    return isNew;
  }

  /** Вызывается после первой вставки, чтобы повторный save той же инстанции обновлял. */
  public void markPersisted() {
    this.isNew = false;
  }

  public UUID getListingId() {
    return listingId;
  }

  public String getS3Key() {
    return s3Key;
  }

  public String getThumbnailS3Key() {
    return thumbnailS3Key;
  }

  public String getFileName() {
    return fileName;
  }

  public String getMimeType() {
    return mimeType;
  }

  public int getSizeBytes() {
    return sizeBytes;
  }

  public PhotoStatus getStatus() {
    return status;
  }

  /** Анализ завершён: превью, оценка и описание готовы (CHECK схемы требует все поля). */
  public void markReady(String thumbnailS3Key, PhotoQuality quality,
      String qualityReason, String scene) {
    this.thumbnailS3Key = thumbnailS3Key;
    this.quality = quality;
    this.qualityReason = qualityReason;
    this.scene = scene;
    this.status = PhotoStatus.ready;
  }

  /** Анализ не удался; фото не обрабатывается повторно (агент перезагружает). */
  public void markFailed(String error) {
    this.error = error;
    this.status = PhotoStatus.failed;
  }

  public String getError() {
    return error;
  }

  public PhotoQuality getQuality() {
    return quality;
  }

  public String getQualityReason() {
    return qualityReason;
  }

  public String getScene() {
    return scene;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }
}
