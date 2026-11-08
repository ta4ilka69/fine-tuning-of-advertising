package com.adtune.backend.web;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.adtune.backend.ai.AdGenerationClient;
import com.adtune.backend.ai.AiClientException;
import com.adtune.backend.auth.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Ошибки API приходят в формате problem+json с полями, которые валидирует
 * фронтенд (type, title, status, code, requestId-UUID), статусы MVC-ошибок
 * корректны, детали провайдера наружу не утекают.
 */
@WebMvcTest(controllers = {HealthController.class, DemoController.class})
class GlobalExceptionHandlerTest {

  private static final String UUID_PATTERN =
      "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

  @Autowired
  private MockMvc mockMvc;

  @MockitoBean
  private AdGenerationClient adGenerationClient;

  @MockitoBean
  private JdbcTemplate jdbcTemplate;

  /** Нужен WebConfig (резолвер @CurrentUser) в web-срезе. */
  @MockitoBean
  private AuthService authService;

  @Test
  void healthIsOkWhenDatabaseResponds() throws Exception {
    when(jdbcTemplate.queryForObject(anyString(), (Class<Integer>) any())).thenReturn(1);

    mockMvc.perform(get("/health"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("ok"))
        .andExpect(jsonPath("$.db").value("ok"));
  }

  @Test
  void healthFailsWhenDatabaseIsDown() throws Exception {
    when(jdbcTemplate.queryForObject(anyString(), (Class<Integer>) any()))
        .thenThrow(new DataAccessResourceFailureException("Connection refused"));

    mockMvc.perform(get("/health"))
        .andExpect(status().isServiceUnavailable())
        .andExpect(jsonPath("$.status").value("error"))
        .andExpect(jsonPath("$.db").value("unavailable"));
  }

  @Test
  void wrongMethodIs405Problem() throws Exception {
    mockMvc.perform(get("/v1/ai/demo"))
        .andExpect(status().isMethodNotAllowed())
        .andExpect(header().string("Content-Type", "application/problem+json"))
        .andExpect(jsonPath("$.type").value("about:blank"))
        .andExpect(jsonPath("$.title").value("Метод не поддерживается."))
        .andExpect(jsonPath("$.status").value(405))
        .andExpect(jsonPath("$.code").value("method_not_allowed"))
        .andExpect(jsonPath("$.requestId", matchesPattern(UUID_PATTERN)));
  }

  @Test
  void wrongMediaTypeIs415Problem() throws Exception {
    mockMvc.perform(post("/v1/ai/demo")
            .contentType(MediaType.TEXT_PLAIN)
            .content("hello"))
        .andExpect(status().isUnsupportedMediaType())
        .andExpect(jsonPath("$.code").value("unsupported_media_type"))
        .andExpect(jsonPath("$.requestId", matchesPattern(UUID_PATTERN)));
  }

  @Test
  void missingParamsIs400ProblemWithOurTitle() throws Exception {
    mockMvc.perform(post("/v1/ai/demo")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("bad_request"))
        .andExpect(jsonPath("$.title", containsString("params")));
  }

  @Test
  void aiFailureHidesProviderDetails() throws Exception {
    when(adGenerationClient.generate(any())).thenThrow(new AiClientException(
        AiClientException.REQUEST_FAILED,
        "Модель вернула ошибку HTTP 403: "
            + "{\"error\":{\"code\":\"unsupported_country_region_territory\"},"
            + "\"host\":\"host.docker.internal/192.168.65.2:8123\"}"));

    mockMvc.perform(post("/v1/ai/demo")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"params\":{\"rooms\":2}}"))
        .andExpect(status().isBadGateway())
        .andExpect(header().string("Content-Type", "application/problem+json"))
        .andExpect(jsonPath("$.code").value("ai_request_failed"))
        .andExpect(jsonPath("$.title").value(
            "Не удалось получить результат от модели. Попробуйте повторить позже."))
        .andExpect(jsonPath("$.requestId", matchesPattern(UUID_PATTERN)))
        .andExpect(content().string(not(containsString("403"))))
        .andExpect(content().string(not(containsString("host.docker.internal"))));
  }

  @Test
  void notConfiguredIs503Problem() throws Exception {
    when(adGenerationClient.generate(any())).thenThrow(new AiClientException(
        AiClientException.NOT_CONFIGURED,
        "Не задан ключ доступа к модели (OPENAI_API_KEY). Проверьте backend/.env."));

    mockMvc.perform(post("/v1/ai/demo")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"params\":{\"rooms\":2}}"))
        .andExpect(status().isServiceUnavailable())
        .andExpect(jsonPath("$.code").value("ai_not_configured"))
        .andExpect(jsonPath("$.requestId", matchesPattern(UUID_PATTERN)));
  }
}
