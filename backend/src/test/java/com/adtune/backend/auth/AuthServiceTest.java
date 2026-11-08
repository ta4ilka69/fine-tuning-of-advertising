package com.adtune.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.adtune.backend.db.AppUser;
import com.adtune.backend.db.Session;
import com.adtune.backend.db.SessionRepository;
import com.adtune.backend.db.UserRepository;
import com.adtune.backend.web.ApiProblem;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class AuthServiceTest {

  private UserRepository users;
  private SessionRepository sessions;
  private AuthService service;

  @BeforeEach
  void setUp() {
    users = mock(UserRepository.class);
    sessions = mock(SessionRepository.class);
    service = new AuthService(users, sessions);
    lenient().when(users.save(any())).thenAnswer(inv -> inv.getArgument(0));
    lenient().when(users.findByLogin(anyString())).thenReturn(Optional.empty());
  }

  @Test
  void registerStoresHashAndPasswordNeverRaw() {
    when(users.existsByLogin("tester")).thenReturn(false);
    var savedUser = new AtomicReference<AppUser>();
    when(users.save(any())).thenAnswer(inv -> {
      savedUser.set(inv.getArgument(0));
      return savedUser.get();
    });

    AuthService.LoginOutcome outcome = service.register("Tester", "long-password-12");

    assertThat(outcome.user().getLogin()).isEqualTo("tester");
    assertThat(savedUser.get().getPasswordHash()).isNotEqualTo("long-password-12");
    assertThat(savedUser.get().getPasswordHash()).startsWith("$2");
  }

  @Test
  void registerSavesSessionWithHashedToken() {
    when(users.existsByLogin("tester")).thenReturn(false);
    var savedUser = new AtomicReference<AppUser>();
    when(users.save(any())).thenAnswer(inv -> {
      savedUser.set(inv.getArgument(0));
      return savedUser.get();
    });

    AuthService.LoginOutcome outcome = service.register("tester", "long-password-12");

    ArgumentCaptor<Session> captor = ArgumentCaptor.forClass(Session.class);
    verify(sessions).save(captor.capture());
    byte[] expected = AuthService.sha256(outcome.token());
    assertThat(captor.getValue().getTokenHash()).isEqualTo(expected);
    assertThat(captor.getValue().getUserId()).isEqualTo(outcome.user().getId());
    assertThat(outcome.token()).doesNotContain("="); // base64url без паддинга
  }

  @Test
  void registerRejectsTakenLogin() {
    when(users.existsByLogin("tester")).thenReturn(true);

    assertThatThrownBy(() -> service.register("tester", "long-password-12"))
        .isInstanceOfSatisfying(ApiProblem.class, problem -> {
          assertThat(problem.status()).isEqualTo(409);
          assertThat(problem.code()).isEqualTo("LOGIN_TAKEN");
        });
    verify(users, never()).save(any());
  }

  @Test
  void validationMatchesFrontendRules() {
    assertThatThrownBy(() -> service.register("ab", "long-password-12"))
        .isInstanceOfSatisfying(ApiProblem.class, p -> assertThat(p.fieldErrors())
            .anyMatch(issue -> "/login".equals(issue.field())));
    assertThatThrownBy(() -> service.register("tester", "short"))
        .isInstanceOfSatisfying(ApiProblem.class, p -> assertThat(p.fieldErrors())
            .anyMatch(issue -> "/password".equals(issue.field())));
    assertThatThrownBy(() -> service.register("тестер", "long-password-12"))
        .isInstanceOfSatisfying(ApiProblem.class, p -> assertThat(p.fieldErrors())
            .anyMatch(issue -> "/login".equals(issue.field())));
  }

  @Test
  void loginFailsForUnknownUserAndWrongPassword() {
    assertThatThrownBy(() -> service.login("nobody", "long-password-12"))
        .isInstanceOfSatisfying(ApiProblem.class, p -> {
          assertThat(p.status()).isEqualTo(401);
          assertThat(p.code()).isEqualTo("INVALID_CREDENTIALS");
        });

    AppUser stored = AppUser.register("tester",
        new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder()
            .encode("long-password-12"));
    when(users.findByLogin("tester")).thenReturn(Optional.of(stored));

    assertThatThrownBy(() -> service.login("tester", "wrong-password-99"))
        .isInstanceOfSatisfying(ApiProblem.class,
            p -> assertThat(p.code()).isEqualTo("INVALID_CREDENTIALS"));

    AuthService.LoginOutcome outcome = service.login("tester", "long-password-12");
    assertThat(outcome.user().getLogin()).isEqualTo("tester");
  }

  @Test
  void resolveRejectsMissingAndExpiredSessions() {
    assertThat(service.resolve(null)).isEmpty();
    assertThat(service.resolve("unknown")).isEmpty();

    AppUser user = AppUser.register("tester", "hash");
    Session expired = expiredSession(user.getId());
    when(sessions.findById(AuthService.sha256("expired"))).thenReturn(Optional.of(expired));

    assertThat(service.resolve("expired")).isEmpty();
    verify(sessions).delete(expired);
  }

  private Session expiredSession(java.util.UUID userId) {
    return Session.of(AuthService.sha256("expired"), userId,
        OffsetDateTime.now().minus(Duration.ofMinutes(1)));
  }
}
