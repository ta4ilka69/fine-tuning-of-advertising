package com.adtune.backend.db;

import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.Transient;
import org.springframework.data.domain.Persistable;
import org.springframework.data.relational.core.mapping.Table;

/**
 * Сессия вошедшего пользователя. В cookie лежит случайный токен,
 * здесь — только его SHA-256, чтобы утечка базы не открывала чужие сессии.
 */
@Table("session")
public class Session implements Persistable<byte[]> {

  /** Новой сущность делает только фабрика; прочитанная из базы — не новая. */
  @Transient
  private boolean isNew;


  private static final long DEFAULT_TTL_DAYS = 30;

  @Id
  private byte[] tokenHash;
  private OffsetDateTime createdAt;
  private OffsetDateTime expiresAt;

  private UUID userId;

  public static Session of(byte[] tokenHash, UUID userId) {
    Session session = new Session();
    session.tokenHash = tokenHash;
    session.userId = userId;
    OffsetDateTime now = OffsetDateTime.now();
    session.createdAt = now;
    session.expiresAt = now.plusDays(DEFAULT_TTL_DAYS);
    session.isNew = true;
    return session;
  }

  public byte[] getTokenHash() {
    return tokenHash;
  }

  @Override
  public byte[] getId() {
    return tokenHash;
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

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public OffsetDateTime getExpiresAt() {
    return expiresAt;
  }

  public boolean expiredAt(OffsetDateTime moment) {
    return expiresAt.isBefore(moment);
  }
}
