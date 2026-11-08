package com.adtune.backend.db;

import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.Transient;
import org.springframework.data.domain.Persistable;
import org.springframework.data.relational.core.mapping.Table;

/** Площадка (Авито, ЦИАН, …). Настройки — в неизменяемых версиях. */
@Table("channel")
public class Channel implements Persistable<UUID> {

  /** Новой сущность делает только фабрика; прочитанная из базы — не новая. */
  @Transient
  private boolean isNew;


  @Id
  private UUID id;
  private String name;
  private String description;
  private boolean isActive;
  private UUID currentVersionId;
  private OffsetDateTime createdAt;

  public static Channel create(String name, String description, UUID firstVersionId) {
    Channel channel = new Channel();
    channel.id = UuidV7.generate();
    channel.name = name;
    channel.description = description == null ? "" : description;
    channel.isActive = true;
    channel.currentVersionId = firstVersionId;
    channel.createdAt = OffsetDateTime.now();
    channel.isNew = true;
    return channel;
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

  public String getName() {
    return name;
  }

  public String getDescription() {
    return description;
  }

  public boolean isActive() {
    return isActive;
  }

  public UUID getCurrentVersionId() {
    return currentVersionId;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }
}
