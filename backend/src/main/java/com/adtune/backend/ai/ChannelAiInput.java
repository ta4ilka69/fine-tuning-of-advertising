package com.adtune.backend.ai;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/**
 * Площадка, для которой модель готовит материалы.
 *
 * @param channelId  идентификатор площадки (возвращается в ответе как есть)
 * @param name       человекочитаемое имя площадки
 * @param instruction системный промпт версии площадки — приоритетнее общих правил
 * @param checklist  правила чек-листа площадки; по каждому модель вернёт true/false
 * @param titleLimit лимит заголовка в символах или null, если не установлен
 * @param textLimit  лимит текста в символах или null, если не установлен
 */
public record ChannelAiInput(
    @JsonProperty("channel_id") String channelId,
    String name,
    String instruction,
    List<String> checklist,
    @JsonProperty("title_limit") Integer titleLimit,
    @JsonProperty("text_limit") Integer textLimit) {

  public ChannelAiInput {
    checklist = checklist == null ? List.of() : List.copyOf(checklist);
  }
}
