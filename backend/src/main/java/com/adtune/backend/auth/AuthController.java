package com.adtune.backend.auth;

import com.adtune.backend.db.AppUser;
import com.adtune.backend.web.ApiProblem;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Регистрация, вход, выход и текущий пользователь. Контракт зафиксирован
 * фронтендом (frontend/src/shared/api/account.ts): register 201, login 200,
 * logout 204, me 200 — все с {"user": {id, login, role}}; cookie session
 * c Path=/api/v1, HttpOnly, SameSite=Lax.
 */
@RestController
@RequestMapping("/v1/auth")
public class AuthController {

  /** Срок жизни cookie совпадает со сроком сессии в базе. */
  private static final Duration SESSION_TTL = Duration.ofDays(30);

  private final AuthService authService;

  public AuthController(AuthService authService) {
    this.authService = authService;
  }

  public record Credentials(String login, String password) {
  }

  public record UserView(String id, String login, String role) {
  }

  public record SessionView(UserView user) {
  }

  @PostMapping("/register")
  public ResponseEntity<SessionView> register(@RequestBody Credentials credentials) {
    requireBody(credentials);
    AuthService.LoginOutcome outcome = authService.register(
        credentials.login(), credentials.password());
    return withSessionCookie(ResponseEntity.status(201), outcome);
  }

  @PostMapping("/login")
  public ResponseEntity<SessionView> login(@RequestBody Credentials credentials) {
    requireBody(credentials);
    AuthService.LoginOutcome outcome = authService.login(
        credentials.login(), credentials.password());
    return withSessionCookie(ResponseEntity.ok(), outcome);
  }

  @PostMapping("/logout")
  public ResponseEntity<Void> logout(HttpServletRequest request) {
    String token = cookieValue(request);
    authService.logout(token);
    ResponseCookie cleared = ResponseCookie.from(AuthService.SESSION_COOKIE, "")
        .httpOnly(true)
        .sameSite("Lax")
        .path("/api/v1")
        .maxAge(0)
        .build();
    return ResponseEntity.noContent()
        .header(HttpHeaders.SET_COOKIE, cleared.toString())
        .build();
  }

  @GetMapping("/me")
  public SessionView me(@CurrentUser AppUser user) {
    return view(user);
  }

  private static void requireBody(Credentials credentials) {
    if (credentials == null) {
      throw ApiProblem.validation(java.util.List.of());
    }
  }

  private ResponseEntity<SessionView> withSessionCookie(
      ResponseEntity.BodyBuilder builder, AuthService.LoginOutcome outcome) {
    ResponseCookie cookie = ResponseCookie.from(AuthService.SESSION_COOKIE, outcome.token())
        .httpOnly(true)
        .sameSite("Lax")
        .path("/api/v1")
        .maxAge(SESSION_TTL)
        .build();
    return builder
        .header(HttpHeaders.SET_COOKIE, cookie.toString())
        .body(view(outcome.user()));
  }

  private static SessionView view(AppUser user) {
    return new SessionView(new UserView(
        user.getId().toString(), user.getLogin(), user.getRole().name()));
  }

  private String cookieValue(HttpServletRequest request) {
    if (request.getCookies() == null) {
      return null;
    }
    for (jakarta.servlet.http.Cookie cookie : request.getCookies()) {
      if (AuthService.SESSION_COOKIE.equals(cookie.getName())) {
        return cookie.getValue();
      }
    }
    return null;
  }
}
