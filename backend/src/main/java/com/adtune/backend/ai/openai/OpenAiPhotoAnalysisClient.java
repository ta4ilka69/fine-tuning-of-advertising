package com.adtune.backend.ai.openai;

import com.adtune.backend.ai.AiClientException;
import com.adtune.backend.ai.PhotoAnalysisClient;
import com.adtune.backend.config.AiProperties;
import com.adtune.backend.db.PhotoImprovement;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/** Оценка фотографии через Chat Completions с изображением (vision). */
public class OpenAiPhotoAnalysisClient implements PhotoAnalysisClient {

  private static final Logger log = LoggerFactory.getLogger(OpenAiPhotoAnalysisClient.class);
  private static final String SCHEMA_NAME = "photo_analysis";

  private static final String RESULT_SCHEMA = """
      {
        "type": "object",
        "additionalProperties": false,
        "required": ["quality", "quality_reason", "scene", "description", "improvements"],
        "properties": {
          "quality": { "type": "integer", "minimum": 1, "maximum": 3 },
          "quality_reason": { "type": "string" },
          "scene": { "type": "string" },
          "description": { "type": "string" },
          "improvements": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["type", "can_improve", "edit_instruction"],
              "properties": {
                "type": { "type": "string", "enum": [%s] },
                "can_improve": { "type": "boolean" },
                "edit_instruction": { "type": ["string", "null"] }
              }
            }
          }
        }
      }
      """;

  private final RestClient restClient;
  private final AiProperties.OpenAi.Model model;
  private final ObjectMapper mapper;

  public OpenAiPhotoAnalysisClient(RestClient restClient, AiProperties.OpenAi settings,
      ObjectMapper mapper) {
    this.restClient = restClient;
    this.model = OpenAiAdGenerationClient.normalizeModel(settings.photo());
    this.mapper = mapper;
  }

  @Override
  public PhotoAnalysis analyze(byte[] image, String mimeType) {
    String dataUrl = "data:" + mimeType + ";base64,"
        + Base64.getEncoder().encodeToString(image);

    ObjectNode systemMessage = mapper.createObjectNode();
    systemMessage.put("role", "system");
    systemMessage.put("content", systemPrompt());

    ArrayNode content = mapper.createArrayNode();
    ObjectNode textPart = mapper.createObjectNode();
    textPart.put("type", "text");
    textPart.put("text", "Оцени эту фотографию квартиры для объявления.");
    content.add(textPart);
    ObjectNode imagePart = mapper.createObjectNode();
    imagePart.put("type", "image_url");
    ObjectNode url = mapper.createObjectNode();
    url.put("url", dataUrl);
    imagePart.set("image_url", url);
    content.add(imagePart);
    ObjectNode userMessage = mapper.createObjectNode();
    userMessage.put("role", "user");
    userMessage.set("content", content);

    ObjectNode request = mapper.createObjectNode();
    request.put("model", model.model());
    if (model.reasoningEffort() != null) {
      request.put("reasoning_effort", model.reasoningEffort());
    }
    request.set("messages", mapper.createArrayNode().add(systemMessage).add(userMessage));
    ObjectNode format = mapper.createObjectNode();
    format.put("type", "json_schema");
    ObjectNode schema = mapper.createObjectNode();
    schema.put("name", SCHEMA_NAME);
    schema.put("strict", true);
    try {
      schema.set("schema", mapper.readTree(
          RESULT_SCHEMA.formatted(improvementCodes())));
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("Некорректная встроенная схема", e);
    }
    format.set("json_schema", schema);
    request.set("response_format", format);

    long startedAt = System.nanoTime();
    byte[] rawBody;
    try {
      rawBody = restClient.post().uri("/chat/completions")
          .body(request)
          .retrieve()
          .body(byte[].class);
    } catch (RestClientResponseException e) {
      String body = e.getResponseBodyAsString();
      log.error("Модель вернула HTTP {} на анализ фото: {}", e.getStatusCode().value(),
          body.length() > 2000 ? body.substring(0, 2000) : body, e);
      throw new AiClientException(AiClientException.REQUEST_FAILED,
          "Модель вернула ошибку HTTP " + e.getStatusCode().value()
              + (body.isBlank() ? "" : ": " + (body.length() > 500 ? body.substring(0, 500) : body)),
          e);
    } catch (RestClientException e) {
      throw new AiClientException(AiClientException.REQUEST_FAILED,
          "Не удалось обратиться к модели: " + e.getMessage(), e);
    }
    PhotoAnalysis analysis = parse(rawBody);
    log.info("Анализ фото за {} мс: quality={}, scene={}",
        (System.nanoTime() - startedAt) / 1_000_000, analysis.quality(), analysis.scene());
    return analysis;
  }

  /**
   * Системный промпт анализа: оценка, описание кадра и разрешённые типы правок
   * из {@link PhotoImprovement} — вместе с кодами, которые модель вернёт в type.
   */
  static String systemPrompt() {
    return """
        Ты оцениваешь фотографии недвижимости для объявления. Оцени фото:
        3 — хорошее, показывать в начале объявления; 2 — можно улучшить
        (плохой свет, беспорядок, обрезан кадр); 1 — не подходит для объявления
        (не о квартире, скриншоты, размытое). В scene коротко напиши, что на фото
        («Гостиная», «Кухня», «Санузел», «Вид из окна»).
        В description дай подробное описание кадра для копирайтера, который
        объявление пишет, не видя фотографий: какая комната, состояние ремонта
        и мебели, свет и атмосфера, примечательные детали (вид из окна,
        техника, планировочные особенности), и что стоит исправить в кадре,
        если есть недостатки. Пиши факты, без домыслов.
        Дополнительно оцени, можно ли улучшить этот кадр разрешёнными типами
        правок. Для каждого типа ниже укажи, применим ли он к кадру.
        Разрешённые типы правок (код типа — название и правила поиска):
        %s
        В improvements верни по одному объекту на каждый разрешённый тип:
        type — код типа из списка выше; can_improve — true, если есть хотя бы
        одна подходящая правка этого типа, иначе false; edit_instruction —
        при true краткая инструкция для редактора: каждый предмет и его точное
        положение в кадре (например, «Убрать пустую пластиковую бутылку у правого
        края кухонной столешницы и две использованные тарелки слева от мойки»);
        при false — null.
        Все тексты (quality_reason, scene, description, edit_instruction) —
        только по-русски.
        Ответ строго по схеме JSON.
        """.formatted(improvementRules());
  }

  /** Блоки «код — «название». правила» по каждому типу правок из каталога. */
  private static String improvementRules() {
    return PhotoImprovement.ordered().stream()
        .map(improvement -> improvement.name() + " — «" + improvement.getEditTitle() + "».\n"
            + improvement.getPromptRules().strip())
        .collect(Collectors.joining("\n\n"));
  }

  /** Коды типов правок для enum-ограничения схемы ответа: "clutter", … */
  private static String improvementCodes() {
    return PhotoImprovement.ordered().stream()
        .map(improvement -> "\"" + improvement.name() + "\"")
        .collect(Collectors.joining(", "));
  }

  private PhotoAnalysis parse(byte[] rawBody) {
    try {
      JsonNode content = mapper.readTree(rawBody).path("choices").path(0)
          .path("message").path("content");
      JsonNode result = mapper.readTree(content.asText());
      int quality = result.path("quality").asInt();
      if (quality < 1 || quality > 3) {
        throw new AiClientException(AiClientException.BAD_RESPONSE,
            "Модель вернула оценку вне диапазона 1–3.");
      }
      List<PhotoAnalysis.Improvement> improvements = new ArrayList<>();
      for (JsonNode item : result.path("improvements")) {
        improvements.add(new PhotoAnalysis.Improvement(
            item.path("type").asText(null),
            item.path("can_improve").asBoolean(false),
            item.path("edit_instruction").isNull() ? null
                : item.path("edit_instruction").asText(null)));
      }
      return new PhotoAnalysis(quality,
          result.path("quality_reason").asText(),
          result.path("scene").asText(),
          result.path("description").asText(),
          improvements);
    } catch (AiClientException e) {
      throw e;
    } catch (IOException | RuntimeException e) {
      log.error("Нечитаемый ответ анализа фото: {}",
          rawBody == null ? "" : new String(rawBody, StandardCharsets.UTF_8), e);
      throw new AiClientException(AiClientException.BAD_RESPONSE,
          "Модель вернула нечитаемый ответ анализа.", e);
    }
  }
}
