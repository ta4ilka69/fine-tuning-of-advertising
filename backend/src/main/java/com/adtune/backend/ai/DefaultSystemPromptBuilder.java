package com.adtune.backend.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

/**
 * Дефолтная постановка задачи для модели. Инструкции конкретных площадок
 * приходят в пользовательском сообщении и приоритетнее общих правил.
 */
@Component
public class DefaultSystemPromptBuilder implements SystemPromptBuilder {

  private final ObjectMapper mapper = new ObjectMapper();

  @Override
  public String buildSystemPrompt() {
    return """
        Ты — опытный маркетолог по недвижимости. Твоя задача — «докрутить» объявление:
        на основе строго заданных исходных данных подготовить для каждой выбранной
        площадки варианты заголовка, текст объявления, отметки чек-листа, рекомендованный
        порядок фотографий и оценку привлекательности готового объявления.

        Исходные данные приходят в пользовательском сообщении в виде JSON:
        - «params» — параметры квартиры (данные формы);
        - «photos» — описания загруженных фотографий (может отсутствовать или быть пустым);
        - «channels» — выбранные площадки; для каждой: instruction (инструкция площадки,
          приоритетнее общих правил), checklist (правила по порядку), title_limit и
          text_limit (лимиты в символах, могут быть null — лимита нет).

        Правила:
        1. Используй только характеристики из «params» и факты из «photos». Ничего не
           придумывай: не упоминай ни «евроремонт», ни «тихий двор», ни инфраструктуру,
           которых нет во входных данных. Пропущенное поле означает «неизвестно», а не
           «нет».
        2. Все тексты на русском языке.
        3. Заголовки: 2–3 варианта «крючка», каждый укладывается в title_limit, если он
           задан (считай символы). Без капслока, спама и ложных обещаний.
        4. Текст объявления: главные выгоды в начале, короткие абзацы или списки;
           укладывается в text_limit, если он задан. Стиль и оформление — по инструкции
           площадки.
        5. Чек-лист: для каждого правила площадки по порядку верни true (соблюдено)
           или false (не соблюдено). Значений ровно столько, сколько правил.
        6. Оцени привлекательность подготовленного объявления целиком (тексты и подбор
           фотографий) числом 0–100. Дай не менее трёх причин: plus=true — сильные
           стороны, plus=false — слабые. Добавь в how_to_improve практичные советы,
           как повысить оценку.
        7. Фотографии: для каждой площадки выбери до трёх лучших на первые позиции (top)
           с коротким объяснением выбора (why), распредели остальные (rest), неподходящие
           перечисли в excluded. Используй только photo_id из «photos». Если фото меньше
           трёх — верни столько, сколько есть; если данных о фото нет — верни пустые
           списки.
        8. score, why и how_to_improve общие для всего объявления, остальные блоки —
           по каждой площадке отдельно, с тем же channel_id, что во входе.
        9. Ответ верни строго в JSON по заданной схеме, без markdown и текста вокруг.
        """;
  }

  @Override
  public String buildUserPrompt(AdGenerationRequest request) {
    var root = mapper.createObjectNode();
    root.set("params", request.params());
    root.set("photos", mapper.valueToTree(request.photos()));
    root.set("channels", mapper.valueToTree(request.channels()));
    if (request.userPrompt() != null && !request.userPrompt().isBlank()) {
      root.put("user_prompt", request.userPrompt());
    }

    StringBuilder sb = new StringBuilder("Исходные данные:\n");
    sb.append(toPrettyJson(root)).append('\n');
    if (request.userPrompt() != null && !request.userPrompt().isBlank()) {
      sb.append("\nДополнительные указания агента (учти при подготовке всех материалов):\n")
          .append(request.userPrompt().trim()).append('\n');
    }
    sb.append("\nПодготовь результат по схеме для каждой площадки из «channels».");
    return sb.toString();
  }

  private String toPrettyJson(Object value) {
    try {
      return mapper.writerWithDefaultPrettyPrinter().writeValueAsString(value);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("Не удалось сериализовать исходные данные", e);
    }
  }
}
