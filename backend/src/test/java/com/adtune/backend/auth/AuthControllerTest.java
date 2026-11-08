package com.adtune.backend.auth;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.matchesPattern;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.adtune.backend.db.AppUser;
import com.adtune.backend.db.UserRole;
import com.adtune.backend.web.ApiProblem;
import com.adtune.backend.web.FieldIssue;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/** Контракт /v1/auth как его ждёт фронтенд: статусы, cookie, problem-коды. */
@WebMvcTest(controllers = AuthController.class)
class AuthControllerTest {

  private static final String UUID_PATTERN =
      "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

  @Autowired
  private MockMvc mockMvc;

  @MockitoBean
  private AuthService authService;

  private AppUser user() {
    return AppUser.register("tester", "bcrypt-hash");
  }

  @Test
  void registerReturns201WithSessionCookie() throws Exception {
    when(authService.register("tester", "long-password-12"))
        .thenReturn(new AuthService.LoginOutcome(user(), "token-value"));

    mockMvc.perform(post("/v1/auth/register")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"login\":\"tester\",\"password\":\"long-password-12\"}"))
        .andExpect(status().isCreated())
        .andExpect(header().string("Set-Cookie",
            containsString("session=token-value")))
        .andExpect(header().string("Set-Cookie", containsString("Path=/api/v1")))
        .andExpect(header().string("Set-Cookie", containsString("HttpOnly")))
        .andExpect(header().string("Set-Cookie", containsString("SameSite=Lax")))
        .andExpect(jsonPath("$.user.login").value("tester"))
        .andExpect(jsonPath("$.user.role").value("agent"))
        .andExpect(jsonPath("$.user.id", matchesPattern(UUID_PATTERN)));
  }

  @Test
  void registerReportsTakenLogin() throws Exception {
    when(authService.register(any(), any()))
        .thenThrow(new ApiProblem(409, "LOGIN_TAKEN", "Логин уже занят. Выберите другой логин."));

    mockMvc.perform(post("/v1/auth/register")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"login\":\"tester\",\"password\":\"long-password-12\"}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("LOGIN_TAKEN"));
  }

  @Test
  void registerReportsFieldIssues() throws Exception {
    when(authService.register(any(), any())).thenThrow(ApiProblem.validation(List.of(
        new FieldIssue("INVALID", "/password", "Пароль должен содержать от 12 до 128 символов"))));

    mockMvc.perform(post("/v1/auth/register")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"login\":\"tester\",\"password\":\"short\"}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
        .andExpect(jsonPath("$.fieldErrors[0].field").value("/password"));
  }

  @Test
  void loginInvalidCredentials() throws Exception {
    when(authService.login("tester", "wrong-password-1"))
        .thenThrow(ApiProblem.invalidCredentials());

    mockMvc.perform(post("/v1/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"login\":\"tester\",\"password\":\"wrong-password-1\"}"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"))
        .andExpect(jsonPath("$.title").value("Неверный логин или пароль"));
  }

  @Test
  void loginReturns200WithCookie() throws Exception {
    when(authService.login("tester", "long-password-12"))
        .thenReturn(new AuthService.LoginOutcome(user(), "fresh-token"));

    mockMvc.perform(post("/v1/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"login\":\"tester\",\"password\":\"long-password-12\"}"))
        .andExpect(status().isOk())
        .andExpect(header().string("Set-Cookie", containsString("session=fresh-token")))
        .andExpect(jsonPath("$.user.login").value("tester"));
  }

  @Test
  void meRequiresSession() throws Exception {
    when(authService.resolve(any())).thenReturn(Optional.empty());

    mockMvc.perform(get("/v1/auth/me"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
  }

  @Test
  void meReturnsCurrentUser() throws Exception {
    when(authService.resolve("good-token")).thenReturn(Optional.of(user()));

    mockMvc.perform(get("/v1/auth/me").cookie(new jakarta.servlet.http.Cookie("session", "good-token")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.user.login").value("tester"))
        .andExpect(jsonPath("$.user.role").value(UserRole.agent.name()));
  }

  @Test
  void logoutClearsCookie() throws Exception {
    mockMvc.perform(post("/v1/auth/logout")
            .cookie(new jakarta.servlet.http.Cookie("session", "some-token")))
        .andExpect(status().isNoContent())
        .andExpect(header().string("Set-Cookie", containsString("Max-Age=0")))
        .andExpect(header().string("Set-Cookie", containsString("Path=/api/v1")));
  }
}
