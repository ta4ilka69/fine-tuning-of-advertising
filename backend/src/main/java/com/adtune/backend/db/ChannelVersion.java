package com.adtune.backend.db;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.Transient;
import org.springframework.data.domain.Persistable;
import org.springframework.data.relational.core.mapping.Table;

/**
 * Неизменяемая версия настроек площадки: системный промпт, чек-лист и лимиты.
 * Новое сохранение настроек создаёт новую версию; на версии ссылаются результаты.
 */
@Table("channel_version")
public class ChannelVersion implements Persistable<UUID> {

  /** Новой сущность делает только фабрика; прочитанная из базы — не новая. */
  @Transient
  private boolean isNew;


  private static final ObjectMapper JSON = new ObjectMapper();

  @Id
  private UUID id;
  private UUID channelId;
  private int number;
  private String instruction;
  private JsonNode checklist;
  private Integer titleLimit;
  private Integer textLimit;
  private OffsetDateTime createdAt;

  public static ChannelVersion create(UUID channelId, int number, String instruction,
      List<String> checklist, Integer titleLimit, Integer textLimit) {
    ChannelVersion version = new ChannelVersion();
    version.id = UuidV7.generate();
    version.channelId = channelId;
    version.number = number;
    version.instruction = instruction;
    version.checklist = JSON.valueToTree(checklist);
    version.titleLimit = titleLimit;
    version.textLimit = textLimit;
    version.createdAt = OffsetDateTime.now();
    version.isNew = true;
    return version;
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

  public UUID getChannelId() {
    return channelId;
  }

  /** Канал и первая версия создаются в одной транзакции (FK отложенный). */
  public void setChannelId(UUID channelId) {
    this.channelId = channelId;
  }

  public int getNumber() {
    return number;
  }

  public String getInstruction() {
    return instruction;
  }

  /** Правила чек-листа площадки (jsonb в схеме). */
  public List<String> getChecklist() {
    if (checklist == null || !checklist.isArray()) {
      return List.of();
    }
    return JSON.convertValue(checklist,
        JSON.getTypeFactory().constructCollectionType(List.class, String.class));
  }

  public Integer getTitleLimit() {
    return titleLimit;
  }

  public Integer getTextLimit() {
    return textLimit;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }
}
