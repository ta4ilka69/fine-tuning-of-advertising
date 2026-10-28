package com.adtune.backend.web;

import com.adtune.backend.ai.AdGenerationClient;
import com.adtune.backend.ai.AdGenerationRequest;
import com.adtune.backend.ai.AdGenerationResult;
import com.adtune.backend.ai.ChannelAiInput;
import com.adtune.backend.ai.PhotoAiInput;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Демо-эндпоинт: генерация материалов без авторизации, БД и сущностей объявлений.
 * Позволяет проверить связку с моделью и промпты до появления /listings и
 * жизненного цикла генераций; после этого будет удалён.
 */
@RestController
@RequestMapping("/ai/demo")
public class DemoController {

  /** Демо-настройки площадок: чек-листы и лимиты согласуются с заказчиком отдельно. */
  private static final List<ChannelAiInput> DEFAULT_CHANNELS = List.of(
      new ChannelAiInput("avito", "Авито",
          """
              Площадка Авито. Стиль: деловой и конкретный. Структура текста: сначала 1–2
              предложения о главном преимуществе, затем характеристики объекта краткими
              абзацами или списком, в конце — короткий призыв написать или позвонить.
              Эмодзи не используйте.""",
          defaultChecklist(), 50, 7000),
      new ChannelAiInput("cian", "ЦИАН",
          """
              Площадка ЦИАН. Стиль: нейтрально-информационный. Структура текста: сильные
              стороны объекта, затем параметры квартиры, затем окружение и транспорт.
              Без эмодзи.""",
          defaultChecklist(), 50, 3000),
      new ChannelAiInput("telegram", "Telegram",
          """
              Канал Telegram. Стиль: живой и компактный. Допустимы умеренные эмодзи,
              короткие абзацы, в конце — призыв к действию. Объём заметно меньше, чем
              для Авито и ЦИАН.""",
          defaultChecklist(), null, 4096));

  private static List<String> defaultChecklist() {
    return List.of(
        "Указана цена",
        "Указана площадь",
        "Указано местоположение или адрес",
        "Есть призыв к действию",
        "Нет характеристик, которых нет в исходных данных");
  }

  private final AdGenerationClient adGenerationClient;

  public DemoController(AdGenerationClient adGenerationClient) {
    this.adGenerationClient = adGenerationClient;
  }

  /**
   * Тело запроса: {@code params} обязателен; {@code channels} и {@code photos}
   * необязательны — без них берутся демо-площадки и пустой список фото.
   */
  public record DemoRequest(
      JsonNode params,
      List<ChannelAiInput> channels,
      List<PhotoAiInput> photos,
      String userPrompt) {
  }

  @PostMapping
  public AdGenerationResult generate(@RequestBody DemoRequest request) {
    if (request.params() == null || request.params().isEmpty()) {
      throw new IllegalArgumentException(
          "Поле params обязательно: передайте данные квартиры (форма «Данные об объекте»).");
    }
    List<ChannelAiInput> channels =
        request.channels() == null || request.channels().isEmpty()
            ? DEFAULT_CHANNELS
            : request.channels();
    return adGenerationClient.generate(new AdGenerationRequest(
        request.params(), request.photos(), channels, request.userPrompt()));
  }
}
