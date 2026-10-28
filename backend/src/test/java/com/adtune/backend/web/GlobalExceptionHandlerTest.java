package com.adtune.backend.web;

import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.adtune.backend.ai.AdGenerationClient;
import com.adtune.backend.ai.AiClientException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/** Регрессия на замечания ревью: корректные статусы MVC-ошибок и безопасные тексты наружу. */
@WebMvcTest(controllers = {HealthController.class, DemoController.class})
class GlobalExceptionHandlerTest {

  @Autowired
  private MockMvc mockMvc;

  @MockitoBean
  private AdGenerationClient adGenerationClient;

  @Test
  void wrongMethodIs405Not500() throws Exception {
    mockMvc.perform(get("/ai/demo"))
        .andExpect(status().isMethodNotAllowed())
        .andExpect(jsonPath("$.error").value("method_not_allowed"));
  }

  @Test
  void wrongMediaTypeIs415Not500() throws Exception {
    mockMvc.perform(post("/ai/demo")
            .contentType(MediaType.TEXT_PLAIN)
            .content("hello"))
        .andExpect(status().isUnsupportedMediaType())
        .andExpect(jsonPath("$.error").value("unsupported_media_type"));
  }

  @Test
  void missingParamsIs400WithOurShape() throws Exception {
    mockMvc.perform(post("/ai/demo")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error").value("bad_request"))
        .andExpect(jsonPath("$.message").isNotEmpty());
  }

  @Test
  void aiFailureHidesProviderDetailsAndAddsRequestId() throws Exception {
    when(adGenerationClient.generate(any())).thenThrow(new AiClientException(
        AiClientException.REQUEST_FAILED,
        "Модель вернула ошибку HTTP 403: "
            + "{\"error\":{\"code\":\"unsupported_country_region_territory\"},"
            + "\"host\":\"host.docker.internal/192.168.65.2:8123\"}"));

    mockMvc.perform(post("/ai/demo")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"params\":{\"rooms\":2}}"))
        .andExpect(status().isBadGateway())
        .andExpect(jsonPath("$.error").value("ai_request_failed"))
        .andExpect(jsonPath("$.requestId").isNotEmpty())
        .andExpect(jsonPath("$.message").value(
            "Не удалось получить результат от модели. Попробуйте повторить позже."))
        .andExpect(content().string(not(containsString("403"))))
        .andExpect(content().string(not(containsString("host.docker.internal"))));
  }

  @Test
  void notConfiguredIs503() throws Exception {
    when(adGenerationClient.generate(any())).thenThrow(new AiClientException(
        AiClientException.NOT_CONFIGURED,
        "Не задан ключ доступа к модели (OPENAI_API_KEY). Проверьте backend/.env."));

    mockMvc.perform(post("/ai/demo")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"params\":{\"rooms\":2}}"))
        .andExpect(status().isServiceUnavailable())
        .andExpect(jsonPath("$.error").value("ai_not_configured"))
        .andExpect(jsonPath("$.requestId").isNotEmpty());
  }
}
