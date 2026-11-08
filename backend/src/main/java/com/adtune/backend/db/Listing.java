package com.adtune.backend.db;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.Transient;
import org.springframework.data.domain.Persistable;
import org.springframework.data.relational.core.mapping.Table;

/**
 * Объявление. Формат {@code data} задаёт фронт, бэкенд передаёт его в генерацию
 * целиком. {@code result} перезаписывается только при успешной генерации и
 * переживает правки данных. {@code version} — оптимистичная блокировка.
 */
@Table("listing")
public class Listing implements Persistable<UUID> {

  /** Новой сущность делает только фабрика; прочитанная из базы — не новая. */
  @Transient
  private boolean isNew;


  @Id
  private UUID id;
  private UUID userId;
  // Инкрементируется методами ниже; проверка ожидаемой версии — на уровне сервиса (П5).
  private Integer version;
  private ListingStatus status;
  private JsonNode data;
  private JsonNode result;
  private OffsetDateTime generationStartedAt;
  private String generationError;
  private OffsetDateTime createdAt;
  private OffsetDateTime updatedAt;

  public static Listing newDraft(UUID userId, JsonNode data) {
    Listing listing = new Listing();
    listing.id = UuidV7.generate();
    listing.userId = userId;
    listing.version = 1; // CHECK схемы: version > 0
    listing.status = ListingStatus.draft;
    listing.data = data;
    OffsetDateTime now = OffsetDateTime.now();
    listing.createdAt = now;
    listing.updatedAt = now;
    listing.isNew = true;
    return listing;
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

  public UUID getUserId() {
    return userId;
  }

  public Integer getVersion() {
    return version;
  }

  public ListingStatus getStatus() {
    return status;
  }

  public JsonNode getData() {
    return data;
  }

  /** Успешная генерация: результат и статус ready (CHECK схемы требует оба). */
  public void markReady(JsonNode result) {
    this.status = ListingStatus.ready;
    this.result = result;
    this.generationError = null;
  }

  /** Неудачная генерация: статус failed с причиной (CHECK схемы). */
  public void markFailed(String error) {
    this.status = ListingStatus.failed;
    this.generationError = error;
  }

  public void startGeneration() {
    this.status = ListingStatus.generating;
    this.generationStartedAt = OffsetDateTime.now();
    this.generationError = null;
  }

  /** Правка данных возвращает в draft, прошлый результат сохраняется. */
  public void editData(JsonNode newData) {
    this.data = newData;
    this.status = ListingStatus.draft;
    this.version = this.version + 1;
    this.updatedAt = OffsetDateTime.now();
  }

  public JsonNode getResult() {
    return result;
  }

  public OffsetDateTime getGenerationStartedAt() {
    return generationStartedAt;
  }

  public String getGenerationError() {
    return generationError;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public OffsetDateTime getUpdatedAt() {
    return updatedAt;
  }
}
