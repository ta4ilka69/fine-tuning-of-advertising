package com.adtune.backend.ai;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

/**
 * Запрос на генерацию материалов объявления.
 *
 * @param params     данные квартиры — поля формы «Данные об объекте» как есть;
 *                   схема формы согласуется отдельно, поэтому здесь произвольный JSON
 * @param photos     описания уже проанализированных фотографий; до анализа пуст
 * @param channels   выбранные площадки с настройками их версий (промпт, чек-лист, лимиты)
 * @param userPrompt необязательное дополнение агента к системному промпту
 */
public record AdGenerationRequest(
    JsonNode params,
    List<PhotoAiInput> photos,
    List<ChannelAiInput> channels,
    String userPrompt) {

  public AdGenerationRequest {
    photos = photos == null ? List.of() : List.copyOf(photos);
    channels = channels == null ? List.of() : List.copyOf(channels);
  }
}
