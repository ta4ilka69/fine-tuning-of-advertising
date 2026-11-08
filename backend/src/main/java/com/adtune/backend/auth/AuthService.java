package com.adtune.backend.auth;

import com.adtune.backend.db.AppUser;
import com.adtune.backend.db.Session;
import com.adtune.backend.db.SessionRepository;
import com.adtune.backend.db.UserRepository;
import com.adtune.backend.web.ApiProblem;
import com.adtune.backend.web.FieldIssue;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Регистрация, вход и cookie-сессии. В cookie лежит случайный токен,
 * в базе — только его SHA-256 (см. таблицу session в infra/db).
 */
@Service
public class AuthService {

  /** Имя cookie зафиксировано фронтендом (e2e-мок): session, Path=/api/v1. */
  public static final String SESSION_COOKIE = "session";

  private static final Pattern LOGIN_PATTERN = Pattern.compile("^[a-z0-9_.-]{3,32}$");
  private static final int PASSWORD_MIN = 12;
  private static final int PASSWORD_MAX = 128;

  private final UserRepository users;
  private final SessionRepository sessions;
  private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
  private final SecureRandom random = new SecureRandom();

  public AuthService(UserRepository users, SessionRepository sessions) {
    this.users = users;
    this.sessions = sessions;
  }

  /** Результат входа: пользователь плюс токен для cookie. */
  public record LoginOutcome(AppUser user, String token) {
  }

  @Transactional
  public LoginOutcome register(String login, String password) {
    String normalizedLogin = validateCredentials(login, password);
    if (users.existsByLogin(normalizedLogin)) {
      throw new ApiProblem(409, "LOGIN_TAKEN", "Логин уже занят. Выберите другой логин.");
    }
    AppUser user = users.save(AppUser.register(normalizedLogin, passwordEncoder.encode(password)));
    return new LoginOutcome(user, issueSession(user));
  }

  @Transactional
  public LoginOutcome login(String login, String password) {
    String normalizedLogin = login == null ? "" : login.trim().toLowerCase();
    validateCredentials(normalizedLogin, password);
    sessions.deleteByExpiresAtBefore(OffsetDateTime.now());
    Optional<AppUser> user = users.findByLogin(normalizedLogin);
    if (user.isEmpty() || !passwordEncoder.matches(password, user.orElseThrow().getPasswordHash())) {
      throw ApiProblem.invalidCredentials();
    }
    return new LoginOutcome(user.orElseThrow(), issueSession(user.orElseThrow()));
  }

  @Transactional
  public void logout(String token) {
    if (token == null || token.isBlank()) {
      return;
    }
    sessions.deleteById(sha256(token));
  }

  /** Пользователь по токену сессии; истёкшие сессии не проходят. */
  @Transactional
  public Optional<AppUser> resolve(String token) {
    if (token == null || token.isBlank()) {
      return Optional.empty();
    }
    Optional<Session> session = sessions.findById(sha256(token));
    if (session.isEmpty()) {
      return Optional.empty();
    }
    if (session.orElseThrow().expiredAt(OffsetDateTime.now())) {
      sessions.delete(session.orElseThrow());
      return Optional.empty();
    }
    return users.findById(session.orElseThrow().getUserId());
  }

  private String issueSession(AppUser user) {
    byte[] tokenBytes = new byte[32];
    random.nextBytes(tokenBytes);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
    sessions.save(Session.of(sha256(token), user.getId()));
    return token;
  }

  /** Правила общие с фронтендом: логин 3–32 [a-z0-9_.-], пароль 12–128. */
  private String validateCredentials(String login, String password) {
    String normalized = login == null ? "" : login.trim().toLowerCase();
    java.util.List<FieldIssue> issues = new java.util.ArrayList<>();
    if (!LOGIN_PATTERN.matcher(normalized).matches()) {
      issues.add(new FieldIssue("INVALID", "/login",
          "Логин должен содержать от 3 до 32 символов: латиница, цифры, точка, дефис и _"));
    }
    int passwordLength = password == null ? 0
        : password.codePointCount(0, password.length());
    if (passwordLength < PASSWORD_MIN || passwordLength > PASSWORD_MAX) {
      issues.add(new FieldIssue("INVALID", "/password",
          "Пароль должен содержать от " + PASSWORD_MIN + " до " + PASSWORD_MAX + " символов"));
    }
    if (!issues.isEmpty()) {
      throw ApiProblem.validation(issues);
    }
    return normalized;
  }

  static byte[] sha256(String token) {
    try {
      return MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 недоступен", e);
    }
  }
}
