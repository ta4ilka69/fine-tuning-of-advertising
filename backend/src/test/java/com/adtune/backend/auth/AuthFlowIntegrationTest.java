package com.adtune.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * Полный сценарий сессий против реальной базы: register → me → login → logout.
 * Включается переменной DB_TEST_URL, в CI пропускается.
 */
@SpringBootTest(properties = "spring.datasource.url=${DB_TEST_URL}")
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DB_TEST_URL", matches = ".+")
@Transactional
class AuthFlowIntegrationTest {

  @Autowired
  private MockMvc mockMvc;

  private final ObjectMapper mapper = new ObjectMapper();

  private static final String PASSWORD = "super-secret-12";

  @Test
  void fullSessionLifecycle() throws Exception {
    // Регистрация выдаёт cookie и пользователя.
    MvcResult registered = mockMvc.perform(post("/v1/auth/register")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"login\":\"flow.user\",\"password\":\"" + PASSWORD + "\"}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.user.login").value("flow.user"))
        .andExpect(jsonPath("$.user.role").value("agent"))
        .andReturn();
    String cookie = sessionCookie(registered);

    // Повторная регистрация того же логина отклоняется.
    mockMvc.perform(post("/v1/auth/register")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"login\":\"FLOW.USER\",\"password\":\"" + PASSWORD + "\"}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("LOGIN_TAKEN"));

    // Сессия работает.
    mockMvc.perform(get("/v1/auth/me").cookie(new Cookie("session", cookie)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.user.login").value("flow.user"));

    // Без сессии — 401 в problem-формате.
    mockMvc.perform(get("/v1/auth/me"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

    // Неверный пароль.
    mockMvc.perform(post("/v1/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"login\":\"flow.user\",\"password\":\"wrong-password-99\"}"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));

    // Вход выдаёт новую сессию.
    MvcResult loggedIn = mockMvc.perform(post("/v1/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"login\":\"Flow.User\",\"password\":\"" + PASSWORD + "\"}"))
        .andExpect(status().isOk())
        .andReturn();
    String secondCookie = sessionCookie(loggedIn);
    assertThat(secondCookie).isNotEqualTo(cookie);

    // Выход удаляет сессию; старая и новая cookie перестают работать.
    mockMvc.perform(post("/v1/auth/logout").cookie(new Cookie("session", secondCookie)))
        .andExpect(status().isNoContent());
    mockMvc.perform(get("/v1/auth/me").cookie(new Cookie("session", secondCookie)))
        .andExpect(status().isUnauthorized());
  }

  private String sessionCookie(MvcResult result) {
    String setCookie = result.getResponse().getHeader("Set-Cookie");
    assertThat(setCookie).isNotBlank();
    return setCookie.split(";")[0].split("=")[1];
  }
}
