package com.adtune.backend.generation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.adtune.backend.ai.AdGenerationClient;
import com.adtune.backend.ai.AdGenerationResult;
import com.adtune.backend.ai.AiClientException;
import com.adtune.backend.ai.PhotoAnalysisClient;
import com.adtune.backend.db.ListingRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.json.JsonMapper;
import jakarta.servlet.http.Cookie;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * Полный цикл генерации с подменённой моделью (реальный OpenAI не зовётся):
 * загрузка фото с анализом → валидация → запуск → результат в формате фронта.
 * Включается переменной DB_TEST_URL, в CI пропускается.
 */
@SpringBootTest(properties = {
    "spring.datasource.url=${DB_TEST_URL}",
    "photo.dir=build/test-photos",
    "adtune.ai-tasks.async=false"})
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DB_TEST_URL", matches = ".+")
@Transactional
class GenerationFlowIntegrationTest {

  @Autowired
  private MockMvc mockMvc;

  @Autowired
  private ListingRepository listings;

  @Autowired
  private com.adtune.backend.db.ChannelRepository channelsRepo;

  @MockitoBean
  private AdGenerationClient adGenerationClient;

  @MockitoBean
  private PhotoAnalysisClient analysisClient;

  private static final JsonMapper JSON = JsonMapper.builder().build();

  private final AtomicReference<String> photoId = new AtomicReference<>();

  @BeforeEach
  void stubAnalysis() {
    when(analysisClient.analyze(any(), any()))
        .thenReturn(new PhotoAnalysisClient.PhotoAnalysis(3, "Светлая комната", "Гостиная"));
  }

  private String register(String login) throws Exception {
    MvcResult result = mockMvc.perform(post("/v1/auth/register")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"login\":\"" + login + "\",\"password\":\"long-password-12\"}"))
        .andExpect(status().isCreated())
        .andReturn();
    return result.getResponse().getHeader("Set-Cookie").split(";")[0].split("=")[1];
  }

  private String createListing(String cookie) throws Exception {
    MvcResult result = mockMvc.perform(post("/v1/listings")
            .cookie(new Cookie("session", cookie))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"data\":{\"deal\":{\"type\":\"sale\",\"price\":14500000},"
                + "\"object\":{\"type\":\"flat\"},"
                + "\"location\":{\"address\":\"г. Москва, ул. Примерная, 12\"}}}"))
        .andExpect(status().isCreated())
        .andReturn();
    return JSON.readTree(utf8(result)).path("id").asText();
  }

  private String uploadPhoto(String cookie, String listingId) throws Exception {
    var image = new java.awt.image.BufferedImage(1, 1, java.awt.image.BufferedImage.TYPE_INT_RGB);
    var out = new java.io.ByteArrayOutputStream();
    javax.imageio.ImageIO.write(image, "png", out);
    MvcResult result = mockMvc.perform(multipart("/v1/listings/{id}/photos", listingId)
            .file(new MockMultipartFile("file", "flat.png", "image/png", out.toByteArray()))
            .param("expectedVersion", "1")
            .cookie(new Cookie("session", cookie)))
        .andExpect(status().isCreated())
        .andReturn();
    return JSON.readTree(utf8(result)).path("photo").path("id").asText();
  }

  private static String utf8(MvcResult result) throws Exception {
    return result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
  }

  @Test
  void successfulGenerationStoresFrontendShape() throws Exception {
    String cookie = register("gen.happy");
    String listingId = createListing(cookie);
    photoId.set(uploadPhoto(cookie, listingId));

    when(adGenerationClient.generate(any())).thenAnswer(inv -> new AdGenerationResult(
        82,
        List.of(new AdGenerationResult.Reason(true, "Есть все ключевые данные"),
            new AdGenerationResult.Reason(true, "Фото обработаны"),
            new AdGenerationResult.Reason(false, "Нет фото санузла")),
        List.of("Добавьте фото санузла"),
        List.of(new AdGenerationResult.ChannelOutcome(
            channelVersionOf("Авито"), List.of("Двушка 54 м² у метро", "Второй вариант"),
            "Продаётся двухкомнатная квартира…",
            List.of(true, true),
            new AdGenerationResult.PhotoPlan(
                List.of(new AdGenerationResult.TopPhoto(photoId.get(), "Светлая комната")),
                List.of(), List.of())))));

    MvcResult started = mockMvc.perform(post("/v1/listings/{id}/generations", listingId)
            .cookie(new Cookie("session", cookie))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"expectedVersion\":2}"))
        .andExpect(status().isAccepted())
        .andReturn();
    JsonNode view = JSON.readTree(utf8(started));
    // синхронный режим: к моменту ответа генерация уже завершена
    assertThat(view.get("status").asText()).isEqualTo("ready");

    JsonNode channel = view.get("result").get("channels").get(0);
    assertThat(channel.get("channelVersionId").asText()).isEqualTo(channelVersionOf("Авито"));
    assertThat(channel.get("channel").get("name").asText()).isEqualTo("Авито");
    assertThat(channel.get("title").asText()).contains("54");
    assertThat(channel.get("score").asInt()).isEqualTo(82);
    assertThat(channel.get("photoIds").get(0).asText()).isEqualTo(photoId.get());
    assertThat(view.get("generationError").isNull()).isTrue();
    assertThat(view.get("hasResult").asBoolean()).isTrue();
  }

  @Test
  void missingAddressBlocksGeneration() throws Exception {
    String cookie = register("gen.invalid");
    MvcResult result = mockMvc.perform(post("/v1/listings")
            .cookie(new Cookie("session", cookie))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"data\":{\"object\":{\"type\":\"flat\"}}}"))
        .andExpect(status().isCreated()).andReturn();
    String listingId = JSON.readTree(utf8(result)).path("id").asText();

    mockMvc.perform(post("/v1/listings/{id}/generations", listingId)
            .cookie(new Cookie("session", cookie))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"expectedVersion\":1}"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
        .andExpect(jsonPath("$.fieldErrors[0].field").value("/data/location/address"));
  }

  @Test
  void busyListingRejectsSecondRun() throws Exception {
    String cookie = register("gen.busy");
    String listingId = createListing(cookie);

    var listing = listings.findById(UUID.fromString(listingId)).orElseThrow();
    listing.startGeneration();
    listing.markPersisted();
    listings.save(listing);

    mockMvc.perform(post("/v1/listings/{id}/generations", listingId)
            .cookie(new Cookie("session", cookie))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"expectedVersion\":1}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("LISTING_BUSY"));
  }

  @Test
  void failedModelMarksListingFailedWithProblem() throws Exception {
    String cookie = register("gen.failed");
    String listingId = createListing(cookie);
    uploadPhoto(cookie, listingId);

    when(adGenerationClient.generate(any())).thenThrow(new AiClientException(
        AiClientException.REQUEST_FAILED,
        "Модель вернула ошибку HTTP 429: too many requests"));

    MvcResult started = mockMvc.perform(post("/v1/listings/{id}/generations", listingId)
            .cookie(new Cookie("session", cookie))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"expectedVersion\":2}"))
        .andExpect(status().isAccepted())
        .andReturn();
    assertThat(JSON.readTree(utf8(started)).get("status").asText()).isEqualTo("failed");

    MvcResult detail = mockMvc.perform(get("/v1/listings/{id}", listingId)
            .cookie(new Cookie("session", cookie)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("failed"))
        .andReturn();
    JsonNode problem = JSON.readTree(utf8(detail)).get("generationError");
    assertThat(problem.get("code").asText()).isEqualTo("GENERATION_FAILED");
    assertThat(problem.get("title").asText()).contains("429");
    assertThat(problem.get("requestId").asText()).isNotBlank();
  }

  @Test
  void unknownChannelIsRejected() throws Exception {
    String cookie = register("gen.channels");
    String listingId = createListing(cookie);

    mockMvc.perform(post("/v1/listings/{id}/generations", listingId)
            .cookie(new Cookie("session", cookie))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"expectedVersion\":1,\"channelIds\":[\"" + UUID.randomUUID() + "\"]}"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.fieldErrors[0].field").value("/channelIds"));
  }

  /** Идентификатор текущей версии площадки (сиды из infra/db). */
  private String channelVersionOf(String name) {
    return channelsRepo.findByName(name).orElseThrow().getCurrentVersionId().toString();
  }
}
