package com.adtune.backend.ai.openai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.adtune.backend.ai.AiClientException;
import com.adtune.backend.ai.PhotoAnalysisClient;
import com.adtune.backend.config.AiProperties;
import java.time.Duration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class OpenAiPhotoAnalysisClientTest {

  private static final String BASE_URL = "https://api.test/v1";

  private RestClient.Builder builder;
  private MockRestServiceServer server;
  private OpenAiPhotoAnalysisClient client;

  @BeforeEach
  void setUp() {
    AiProperties.OpenAi settings =
        new AiProperties.OpenAi(BASE_URL, "test-key", "gpt-test", "low");
    builder = OpenAiAdGenerationClient.configureRestClient(
        RestClient.builder(), BASE_URL, "test-key", Duration.ofSeconds(5),
        OpenAiAdGenerationClient.wireMapper());
    server = MockRestServiceServer.bindTo(builder).build();
    client = new OpenAiPhotoAnalysisClient(builder.build(), settings,
        OpenAiAdGenerationClient.wireMapper());
  }

  @Test
  void sendsImageDataUrlAndParsesAnalysis() throws Exception {
    byte[] png = new byte[] {(byte) 0x89, 'P', 'N', 'G', 1, 2, 3};
    String content = "{\"quality\":2,\"quality_reason\":\"Тёмный кадр\",\"scene\":\"Кухня\"}";
    String payload = "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":"
        + "\"" + content.replace("\"", "\\\"") + "\"}}]}";

    server.expect(requestTo(BASE_URL + "/chat/completions"))
        .andExpect(jsonPath("$.model").value("gpt-test"))
        .andExpect(jsonPath("$.response_format.type").value("json_schema"))
        .andExpect(jsonPath("$.messages[1].content[1].type").value("image_url"))
        .andExpect(jsonPath("$.messages[1].content[1].image_url.url",
            org.hamcrest.Matchers.startsWith("data:image/png;base64,")))
        .andRespond(withSuccess(payload, MediaType.APPLICATION_JSON));

    PhotoAnalysisClient.PhotoAnalysis analysis = client.analyze(png, "image/png");

    assertThat(analysis.quality()).isEqualTo(2);
    assertThat(analysis.scene()).isEqualTo("Кухня");
    assertThat(analysis.qualityReason()).isEqualTo("Тёмный кадр");
    server.verify();
  }

  @Test
  void rejectsQualityOutOfRange() throws Exception {
    String content = "{\"quality\":7,\"quality_reason\":\"—\",\"scene\":\"—\"}";
    String payload = "{\"choices\":[{\"message\":{\"content\":"
        + "\"" + content.replace("\"", "\\\"") + "\"}}]}";
    server.expect(requestTo(BASE_URL + "/chat/completions"))
        .andRespond(withSuccess(payload, MediaType.APPLICATION_JSON));

    assertThatThrownBy(() -> client.analyze(new byte[] {1}, "image/png"))
        .isInstanceOf(AiClientException.class)
        .hasMessageContaining("1–3");
  }
}
