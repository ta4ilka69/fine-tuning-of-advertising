package com.adtune.backend.ai.openai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.adtune.backend.ai.AdGenerationRequest;
import com.adtune.backend.ai.AdGenerationResult;
import com.adtune.backend.ai.AiClientException;
import com.adtune.backend.ai.ChannelAiInput;
import com.adtune.backend.ai.DefaultSystemPromptBuilder;
import com.adtune.backend.ai.PhotoAiInput;
import com.adtune.backend.config.AiProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class OpenAiAdGenerationClientTest {

  private static final String BASE_URL = "https://api.test/v1";

  private final ObjectMapper plainMapper = new ObjectMapper();
  private final ObjectMapper wireMapper = OpenAiAdGenerationClient.wireMapper();

  private RestClient.Builder restClientBuilder;
  private MockRestServiceServer server;
  private OpenAiAdGenerationClient client;

  @BeforeEach
  void setUp() {
    AiProperties.OpenAi settings = new AiProperties.OpenAi(BASE_URL, "test-key", "gpt-test", "low");
    // Сначала общий конфиг (base url, конвертеры, таймаут), затем мок-сервер:
    // bindTo подменяет request factory билдера и должен остаться последним.
    restClientBuilder = OpenAiAdGenerationClient.configureRestClient(
        RestClient.builder(), BASE_URL, settings.apiKey(), Duration.ofSeconds(5), wireMapper);
    server = MockRestServiceServer.bindTo(restClientBuilder).build();
    client = new OpenAiAdGenerationClient(
        restClientBuilder.build(), settings, new DefaultSystemPromptBuilder(), wireMapper);
  }

  private AdGenerationRequest sampleRequest() throws Exception {
    return new AdGenerationRequest(
        plainMapper.readTree("""
            {"deal": "sale", "price": 14500000, "rooms": 2}
            """),
        List.of(new PhotoAiInput("1", "Гостиная"), new PhotoAiInput("2", "Кухня")),
        List.of(new ChannelAiInput("avito", "Авито", "Деловой стиль.",
            List.of("Указана цена"), 50, null)),
        null);
  }

  /** Ответ с реалистичным набором полей Chat Completions, включая неизвестные клиенту. */
  private String chatResponseWithContent(String content) throws Exception {
    var message = plainMapper.createObjectNode();
    message.put("role", "assistant");
    message.put("content", content);
    message.putNull("refusal");
    message.putArray("annotations");
    var choice = plainMapper.createObjectNode();
    choice.put("index", 0);
    choice.set("message", message);
    choice.putNull("logprobs");
    choice.put("finish_reason", "stop");
    var usage = plainMapper.createObjectNode();
    usage.put("prompt_tokens", 1500);
    usage.put("completion_tokens", 400);
    usage.put("total_tokens", 1900);
    usage.putObject("prompt_tokens_details").put("cached_tokens", 0);
    usage.putObject("completion_tokens_details").put("reasoning_tokens", 0);
    var root = plainMapper.createObjectNode();
    root.put("id", "chatcmpl-test123");
    root.put("object", "chat.completion");
    root.put("created", 1760000000);
    root.put("model", "gpt-test");
    root.set("choices", plainMapper.createArrayNode().add(choice));
    root.set("usage", usage);
    root.put("service_tier", "default");
    root.put("system_fingerprint", "fp_test");
    return plainMapper.writeValueAsString(root);
  }

  @Test
  void sendsStructuredRequestAndParsesResult() throws Exception {
    String modelContent = """
        {
          "score": 78,
          "why": [
            {"plus": true, "text": "Подробно описано расположение"},
            {"plus": true, "text": "Есть фото всех комнат"},
            {"plus": false, "text": "Нет фото санузла"}
          ],
          "how_to_improve": ["Добавьте фото санузла"],
          "channels": [
            {
              "channel_id": "avito",
              "titles": ["Двушка 54 м² в кирпичном доме", "Квартира у метро"],
              "text": "Продаётся двухкомнатная квартира…",
              "checklist": [true, true, true, true, true],
              "photos": {
                "top": [{"photo_id": "1", "why": "Самая светлая комната"}],
                "rest": ["2"],
                "excluded": []
              }
            }
          ]
        }
        """;

    server.expect(requestTo(BASE_URL + "/chat/completions"))
        .andExpect(method(HttpMethod.POST))
        .andExpect(jsonPath("$.model").value("gpt-test"))
        .andExpect(jsonPath("$.reasoning_effort").value("low"))
        .andExpect(jsonPath("$.messages[0].role").value("system"))
        .andExpect(jsonPath("$.messages[1].role").value("user"))
        .andExpect(jsonPath("$.response_format.type").value("json_schema"))
        .andExpect(jsonPath("$.response_format.json_schema.strict").value(true))
        .andExpect(jsonPath("$.response_format.json_schema.schema.required[0]").value("score"))
        .andRespond(withSuccess(chatResponseWithContent(modelContent), MediaType.APPLICATION_JSON));

    AdGenerationResult result = client.generate(sampleRequest());

    assertThat(result.score()).isEqualTo(78);
    assertThat(result.why()).hasSize(3);
    assertThat(result.why().get(2).plus()).isFalse();
    assertThat(result.howToImprove()).containsExactly("Добавьте фото санузла");
    assertThat(result.channels()).hasSize(1);
    AdGenerationResult.ChannelOutcome outcome = result.channels().get(0);
    assertThat(outcome.channelId()).isEqualTo("avito");
    assertThat(outcome.titles()).hasSize(2);
    assertThat(outcome.checklist()).hasSize(5);
    assertThat(outcome.photos().top()).extracting(AdGenerationResult.TopPhoto::photoId)
        .containsExactly("1");
    assertThat(outcome.photos().rest()).containsExactly("2");

    server.verify();
  }

  @Test
  void mapsHttpErrorToAiClientException() throws Exception {
    server.expect(requestTo(BASE_URL + "/chat/completions"))
        .andRespond(withServerError());

    assertThatThrownBy(() -> client.generate(sampleRequest()))
        .isInstanceOf(AiClientException.class)
        .hasMessageContaining("HTTP 500");
    server.verify();
  }

  @Test
  void reportsClearErrorWhenBodyIsNotChatCompletionsJson() throws Exception {
    server.expect(requestTo(BASE_URL + "/chat/completions"))
        .andRespond(withSuccess("не JSON вообще", MediaType.APPLICATION_JSON));

    assertThatThrownBy(() -> client.generate(sampleRequest()))
        .isInstanceOf(AiClientException.class)
        .hasMessageContaining("неожиданном формате");
    server.verify();
  }

  @Test
  void reportsClearErrorWhenBodyIsEmpty() throws Exception {
    server.expect(requestTo(BASE_URL + "/chat/completions"))
        .andRespond(withSuccess("", MediaType.APPLICATION_JSON));

    assertThatThrownBy(() -> client.generate(sampleRequest()))
        .isInstanceOf(AiClientException.class)
        .hasMessageContaining("пустой ответ");
    server.verify();
  }

  @Test
  void rejectsBlankApiKeyBeforeRequest() throws Exception {
    AiProperties.OpenAi settings = new AiProperties.OpenAi(BASE_URL, "", "gpt-test", null);
    OpenAiAdGenerationClient noKeyClient = new OpenAiAdGenerationClient(
        restClientBuilder.build(), settings, new DefaultSystemPromptBuilder(), wireMapper);

    assertThatThrownBy(() -> noKeyClient.generate(sampleRequest()))
        .isInstanceOf(AiClientException.class)
        .hasMessageContaining("OPENAI_API_KEY");
  }

  @Test
  void omitsReasoningEffortWhenNotConfigured() throws Exception {
    AiProperties.OpenAi settings = new AiProperties.OpenAi(BASE_URL, "test-key", "gpt-4o-mini", null);
    OpenAiAdGenerationClient gpt4Client = new OpenAiAdGenerationClient(
        restClientBuilder.build(), settings, new DefaultSystemPromptBuilder(), wireMapper);

    server.expect(requestTo(BASE_URL + "/chat/completions"))
        .andExpect(jsonPath("$.model").value("gpt-4o-mini"))
        .andExpect(jsonPath("$.reasoning_effort").doesNotExist())
        .andRespond(withSuccess(chatResponseWithContent(minimalResultJson()), MediaType.APPLICATION_JSON));

    gpt4Client.generate(sampleRequest());
    server.verify();
  }

  @Test
  void rejectsInvalidReasoningEffortAtConstruction() {
    AiProperties.OpenAi settings = new AiProperties.OpenAi(BASE_URL, "test-key", "gpt-test", "ultra");
    assertThatThrownBy(() -> new OpenAiAdGenerationClient(
        restClientBuilder.build(), settings, new DefaultSystemPromptBuilder(), wireMapper))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("reasoning-effort")
        .hasMessageContaining("ultra");
  }

  private String minimalResultJson() {
    return """
        {
          "score": 50,
          "why": [
            {"plus": true, "text": "причина 1"},
            {"plus": true, "text": "причина 2"},
            {"plus": false, "text": "причина 3"}
          ],
          "how_to_improve": ["совет"],
          "channels": [
            {
              "channel_id": "avito",
              "titles": ["Заголовок"],
              "text": "Текст",
              "checklist": [true],
              "photos": {"top": [], "rest": [], "excluded": []}
            }
          ]
        }
        """;
  }
}
