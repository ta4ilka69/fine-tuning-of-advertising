package com.adtune.backend.db;

import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.Transient;
import org.springframework.data.domain.Persistable;
import org.springframework.data.relational.core.mapping.Table;

/**
 * Пользователь: агент или администратор. Логин хранится в нижнем регистре
 * (схема гарантирует паттерн), пароль — только хеш.
 */
@Table("users")
public class AppUser implements Persistable<UUID> {

  /** Новой сущность делает только фабрика; прочитанная из базы — не новая. */
  @Transient
  private boolean isNew;


  @Id
  private UUID id;
  private String login;
  private String name;
  private String passwordHash;
  private UserRole role;
  private OffsetDateTime createdAt;

  public static AppUser register(String login, String passwordHash) {
    AppUser user = new AppUser();
    user.id = UuidV7.generate();
    user.login = login.toLowerCase();
    user.passwordHash = passwordHash;
    user.role = UserRole.agent; // админа назначают вручную, регистрация создаёт агентов
    user.createdAt = OffsetDateTime.now();
    user.isNew = true;
    return user;
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

  public String getLogin() {
    return login;
  }

  public String getName() {
    return name;
  }

  public String getPasswordHash() {
    return passwordHash;
  }

  public UserRole getRole() {
    return role;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }
}
