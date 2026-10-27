package com.adtune.backend.ai.openai;

import com.adtune.backend.ai.AdGenerationClient;
import com.adtune.backend.ai.AdGenerationRequest;
import com.adtune.backend.ai.AdGenerationResult;
import com.adtune.backend.ai.AiClientException;
import com.adtune.backend.ai.ChannelAiInput;
import com.adtune.backend.ai.SystemPromptBuilder;
import com.adtune.backend.config.AiProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.http.client.ClientHttpRequestFactoryBuilder;
import org.springframework.boot.http.client.ClientHttpRequestFactorySettings;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * Имплементация через OpenAI Chat Completions API с гарантированным JSON-ответом
 * (response_format = json_schema, strict). Работает с любым API-совместимым
 * шлюзом — базовый URL настраивается.
 */
public class OpenAiAdGenerationClient implements AdGenerationClient {

  private static final Logger log = LoggerFactory.getLogger(OpenAiAdGenerationClient.class);
  private static final String SCHEMA_NAME = "ad_generation_result";

  /**
   * Схема ответа модели. Ключи совпадают с JSON-представлением
   * {@link AdGenerationResult} и моделью данных проекта.
   */
  private static final String RESULT_SCHEMA = """
      {
        "type": "object",
        "additionalProperties": false,
        "required": ["score", "why", "how_to_improve", "channels"],
        "properties": {
          "score": { "type": "integer", "minimum": 0, "maximum": 100 },
          "why": {
            "type": "array",
            "minItems": 3,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["plus", "text"],
              "properties": {
                "plus": { "type": "boolean" },
                "text": { "type": "string" }
              }
            }
          },
          "how_to_improve": { "type": "array", "minItems": 1, "items": { "type": "string" } },
          "channels": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["channel_id", "titles", "text", "checklist", "photos"],
              "properties": {
                "channel_id": { "type": "string" },
                "titles": { "type": "array", "minItems": 1, "maxItems": 3, "items": { "type": "string" } },
                "text": { "type": "string" },
                "checklist": { "type": "array", "items": { "type": "boolean" } },
                "photos": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["top", "rest", "excluded"],
                  "properties": {
                    "top": {
                      "type": "array",
                      "maxItems": 3,
                      "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["photo_id", "why"],
                        "properties": {
                          "photo_id": { "type": "string" },
                          "why": { "type": "string" }
                        }
                      }
                    },
                    "rest": { "type": "array", "items": { "type": "string" } },
                    "excluded": { "type": "array", "items": { "type": "string" } }
                  }
                }
              }
            }
          }
        }
      }
      """;

  private final RestClient restClient;
  private final AiProperties.OpenAi settings;
  private final SystemPromptBuilder promptBuilder;
  private final ObjectMapper jsonMapper;
  private final JsonNode resultSchema;

  public OpenAiAdGenerationClient(RestClient restClient,
      AiProperties.OpenAi settings,
      SystemPromptBuilder promptBuilder,
      ObjectMapper jsonMapper) {
    this.restClient = restClient;
    this.settings = settings;
    this.promptBuilder = promptBuilder;
    this.jsonMapper = jsonMapper;
    try {
      this.resultSchema = jsonMapper.readTree(RESULT_SCHEMA);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("Некорректная встроенная схема ответа модели", e);
    }
  }

  /** Настраивает билдер RestClient под wire-формат OpenAI (snake_case, таймаут, ключ). */
  public static RestClient.Builder configureRestClient(RestClient.Builder builder,
      String baseUrl,
      String apiKey,
      Duration readTimeout,
      ObjectMapper jsonMapper) {
    return builder
        .baseUrl(baseUrl)
        .requestFactory(ClientHttpRequestFactoryBuilder.jdk()
            .build(ClientHttpRequestFactorySettings.defaults().withReadTimeout(readTimeout)))
        .messageConverters(converters -> {
          converters.removeIf(MappingJackson2HttpMessageConverter.class::isInstance);
          converters.add(new MappingJackson2HttpMessageConverter(jsonMapper));
        })
        .defaultHeader(HttpHeaders.AUTHORIZATION,
            "Bearer " + (apiKey == null ? "" : apiKey))
        .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);
  }

  @Override
  public AdGenerationResult generate(AdGenerationRequest request) {
    if (settings.apiKey() == null || settings.apiKey().isBlank()) {
      throw new AiClientException(AiClientException.NOT_CONFIGURED,
          "Не задан ключ доступа к модели (OPENAI_API_KEY). Проверьте backend/.env.");
    }
    if (request.channels().isEmpty()) {
      throw new IllegalArgumentException("Запрос не содержит ни одной площадки для генерации.");
    }

    log.info("Запуск генерации: модель={}, площадки={}, фото={} шт., полей в params={}",
        settings.model(),
        request.channels().stream().map(ChannelAiInput::channelId).toList(),
        request.photos().size(),
        request.params() == null ? 0 : request.params().size());

    ChatRequest chatRequest = new ChatRequest(
        settings.model(),
        List.of(
            new ChatMessage("system", promptBuilder.buildSystemPrompt()),
            new ChatMessage("user", promptBuilder.buildUserPrompt(request))),
        new ResponseFormat("json_schema",
            new JsonSchemaFormat(SCHEMA_NAME, Boolean.TRUE, resultSchema)));

    long startedAt = System.nanoTime();
    ChatResponse response = callModel(chatRequest);
    String content = extractContent(response);
    AdGenerationResult result = parseResult(content);
    log.info("Модель {} вернула результат за {} мс: score={}, площадок={}, токенов={}",
        settings.model(), (System.nanoTime() - startedAt) / 1_000_000,
        result.score(), result.channels().size(),
        response.usage() == null ? "?" : response.usage().totalTokens());
    return result;
  }

  /**
   * Ответ читается байтами и парсится вручную: при проблемах формата в лог
   * попадает само тело ответа, а не безликая ошибка конвертера, а UTF-8
   * определяется корректно (String-конвертер декодировал бы как ISO-8859-1).
   */
  private ChatResponse callModel(ChatRequest chatRequest) {
    byte[] rawBody;
    try {
      rawBody = restClient.post()
          .uri("/chat/completions")
          .body(chatRequest)
          .retrieve()
          .body(byte[].class);
    } catch (RestClientResponseException e) {
      String body = e.getResponseBodyAsString();
      log.error("Модель вернула HTTP {}: {}", e.getStatusCode().value(), truncate(body, 2000), e);
      throw new AiClientException(AiClientException.REQUEST_FAILED,
          "Модель вернула ошибку HTTP " + e.getStatusCode().value() + ": " + truncate(body, 500), e);
    } catch (RestClientException e) {
      Throwable root = NestedExceptionUtils.getMostSpecificCause(e);
      log.error("Не удалось обратиться к модели: {}", root.getMessage(), e);
      throw new AiClientException(AiClientException.REQUEST_FAILED,
          "Не удалось обратиться к модели: " + root.getMessage(), e);
    }
    if (rawBody == null || rawBody.length == 0) {
      log.error("Модель вернула пустое тело ответа (HTTP 200)");
      throw new AiClientException(AiClientException.BAD_RESPONSE,
          "Модель вернула пустой ответ.");
    }
    try {
      return jsonMapper.readValue(rawBody, ChatResponse.class);
    } catch (IOException e) {
      log.error("Ответ модели не соответствует формату Chat Completions: {}. Тело ответа: {}",
          e.getMessage(), truncate(new String(rawBody, StandardCharsets.UTF_8), 2000), e);
      throw new AiClientException(AiClientException.BAD_RESPONSE,
          "Модель вернула ответ в неожиданном формате: " + e.getMessage(), e);
    }
  }

  private String extractContent(ChatResponse response) {
    if (response.choices() == null || response.choices().isEmpty()
        || response.choices().get(0).message() == null
        || response.choices().get(0).message().content() == null
        || response.choices().get(0).message().content().isBlank()) {
      throw new AiClientException(AiClientException.BAD_RESPONSE,
          "В ответе модели нет содержимого.");
    }
    return response.choices().get(0).message().content();
  }

  private AdGenerationResult parseResult(String content) {
    try {
      return jsonMapper.readValue(content, AdGenerationResult.class);
    } catch (JsonProcessingException e) {
      log.error("Содержимое модели не разобрать как JSON результата: {}. Содержимое: {}",
          e.getOriginalMessage(), truncate(content, 2000), e);
      throw new AiClientException(AiClientException.BAD_RESPONSE,
          "Модель вернула ответ, который не удалось разобрать как JSON результата: "
              + e.getOriginalMessage(), e);
    }
  }

  private static String truncate(String text, int limit) {
    if (text == null) {
      return "";
    }
    return text.length() <= limit ? text : text.substring(0, limit) + "…";
  }

  // ----- wire-формат OpenAI; сериализуется ObjectMapper'ом в snake_case -----

  record ChatRequest(String model, List<ChatMessage> messages, ResponseFormat responseFormat) {
  }

  record ChatMessage(String role, String content) {
  }

  record ResponseFormat(String type, JsonSchemaFormat jsonSchema) {
  }

  record JsonSchemaFormat(String name, Boolean strict, JsonNode schema) {
  }

  record ChatResponse(List<Choice> choices, Usage usage) {
  }

  record Choice(int index, ChatMessage message, String finishReason) {
  }

  record Usage(Integer totalTokens) {
  }
}
