package com.adtune.backend.photo;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * Загрузка фото против реальной базы и файлового хранилища (каталог
 * build/test-photos): валидации, версии объявления, контент и превью,
 * изоляция пользователей. Включается переменной DB_TEST_URL.
 */
@SpringBootTest(properties = {
    "spring.datasource.url=${DB_TEST_URL}",
    "photo.dir=build/test-photos",
    "adtune.ai-tasks.async=false"})
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DB_TEST_URL", matches = ".+")
@Transactional
class PhotoFlowIntegrationTest {

  /** Валидный PNG 1×1, собирается кодеком — без хрупких байтовых констант. */
  private static byte[] png1x1() {
    var image = new java.awt.image.BufferedImage(1, 1, java.awt.image.BufferedImage.TYPE_INT_RGB);
    image.setRGB(0, 0, 0x33AA55);
    var out = new java.io.ByteArrayOutputStream();
    try {
      javax.imageio.ImageIO.write(image, "png", out);
    } catch (java.io.IOException e) {
      throw new IllegalStateException(e);
    }
    return out.toByteArray();
  }

  private static byte[] PNG = png1x1();

  @Autowired
  private MockMvc mockMvc;

  @org.springframework.test.context.bean.override.mockito.MockitoBean
  private com.adtune.backend.ai.PhotoAnalysisClient analysisClient;

  private String cookie;

  private String register() throws Exception {
    MvcResult result = mockMvc.perform(post("/v1/auth/register")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"login\":\"photo.user\",\"password\":\"long-password-12\"}"))
        .andExpect(status().isCreated())
        .andReturn();
    return result.getResponse().getHeader("Set-Cookie").split(";")[0].split("=")[1];
  }

  private String createListing(String cookie) throws Exception {
    MvcResult result = mockMvc.perform(post("/v1/listings")
            .cookie(new Cookie("session", cookie))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"data\":{\"deal\":{\"type\":\"sale\"},"
                + "\"location\":{\"address\":\"г. Москва, ул. Примерная, 12\"}}}"))
        .andExpect(status().isCreated())
        .andReturn();
    return com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
        .readTree(result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8))
        .path("id").asText();
  }

  @org.junit.jupiter.api.BeforeEach
  void stubAnalysis() {
    org.mockito.Mockito.when(analysisClient.analyze(org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.anyString()))
        .thenReturn(new com.adtune.backend.ai.PhotoAnalysisClient.PhotoAnalysis(
            3, "Светлая комната", "Гостиная"));
  }

  @Test
  void uploadContentThumbnailRemove() throws Exception {
    String cookie = register();
    String listingId = createListing(cookie);

    // Загрузка: версия объявления растёт, фото processing с обоими URL.
    MvcResult uploaded = mockMvc.perform(multipart("/v1/listings/{id}/photos", listingId)
            .file(new MockMultipartFile("file", "flat.png", "image/png", PNG))
            .param("expectedVersion", "1")
            .cookie(new Cookie("session", cookie)))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.version").value(2))
        .andExpect(jsonPath("$.photo.status").value("ready"))
        .andExpect(jsonPath("$.photo.mimeType").value("image/png"))
        .andExpect(jsonPath("$.photo.thumbnailUrl").isNotEmpty())
        .andReturn();
    String photoJson = uploaded.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
    String photoId = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
        .readTree(photoJson).path("photo").path("id").asText();

    // Фото появляется в карточке объявления.
    mockMvc.perform(get("/v1/listings/{id}", listingId).cookie(new Cookie("session", cookie)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.photos.length()").value(1))
        .andExpect(jsonPath("$.photos[0].status").value("ready"));

    // Контент — исходные байты PNG; превью — JPEG.
    mockMvc.perform(get("/v1/listings/{lid}/photos/{pid}/content", listingId, photoId)
            .cookie(new Cookie("session", cookie)))
        .andExpect(status().isOk())
        .andExpect(content().bytes(PNG));
    mockMvc.perform(get("/v1/listings/{lid}/photos/{pid}/thumbnail", listingId, photoId)
            .cookie(new Cookie("session", cookie)))
        .andExpect(status().isOk())
        .andExpect(content().contentType("image/jpeg"));

    // Чужой пользователь не получает ни файлы, ни загрузку (403).
    MvcResult strangerRegister = mockMvc.perform(post("/v1/auth/register")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"login\":\"photo.stranger\",\"password\":\"long-password-12\"}"))
        .andExpect(status().isCreated()).andReturn();
    String stranger = strangerRegister.getResponse().getHeader("Set-Cookie")
        .split(";")[0].split("=")[1];
    mockMvc.perform(get("/v1/listings/{lid}/photos/{pid}/content", listingId, photoId)
            .cookie(new Cookie("session", stranger)))
        .andExpect(status().isForbidden());

    // Не-изображение отклоняется (415) — magic bytes, а не заявленный тип.
    mockMvc.perform(multipart("/v1/listings/{id}/photos", listingId)
            .file(new MockMultipartFile("file", "fake.png", "image/png",
                "not an image".getBytes(java.nio.charset.StandardCharsets.UTF_8)))
            .param("expectedVersion", "2")
            .cookie(new Cookie("session", cookie)))
        .andExpect(status().isUnsupportedMediaType());

    // Устаревшая версия отклоняется.
    mockMvc.perform(multipart("/v1/listings/{id}/photos", listingId)
            .file(new MockMultipartFile("file", "flat.png", "image/png", PNG))
            .param("expectedVersion", "1")
            .cookie(new Cookie("session", cookie)))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));

    // Удаление: версия снова растёт, фото исчезает из карточки.
    mockMvc.perform(delete("/v1/listings/{lid}/photos/{pid}", listingId, photoId)
            .cookie(new Cookie("session", cookie)).param("expectedVersion", "2"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.version").value(3));
    mockMvc.perform(get("/v1/listings/{id}", listingId).cookie(new Cookie("session", cookie)))
        .andExpect(jsonPath("$.photos.length()").value(0));
  }
}
