package com.adtune.backend.web;

import com.adtune.backend.ai.AiClientException;
import java.net.URI;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Ошибки API отдаются как application/problem+json (RFC 9457) со стабильным кодом
 * и requestId, по которому запись находится в логах. Состав полей зафиксирован
 * фронтенд-валидатором (frontend/src/shared/api/errors.ts): type, title, status,
 * code, requestId — обязательны; detail, fieldErrors, currentVersion — опциональны.
 *
 * <p>Технические детали (тексты ошибок провайдера, сетевые причины) наружу не
 * отдаются — только в лог вместе с requestId.
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

  private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
  private static final URI PROBLEM_TYPE = URI.create("about:blank");

  @ExceptionHandler(AiClientException.class)
  public ResponseEntity<ProblemDetail> handleAiClient(AiClientException e) {
    HttpStatus status = AiClientException.NOT_CONFIGURED.equals(e.code())
        ? HttpStatus.SERVICE_UNAVAILABLE
        : HttpStatus.BAD_GATEWAY;
    ProblemDetail problem = problem(status, e.code(), aiTitle(e.code()), null);
    log.error("AI-ошибка [{}] {}: {}", requestId(problem), e.code(), e.getMessage(), e);
    return response(problem);
  }

  @ExceptionHandler(IllegalArgumentException.class)
  public ResponseEntity<ProblemDetail> handleBadRequest(IllegalArgumentException e) {
    String title = e.getMessage() == null ? "Некорректный запрос." : e.getMessage();
    return response(problem(HttpStatus.BAD_REQUEST, "bad_request", title, null));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<ProblemDetail> handleUnexpected(Exception e) {
    ProblemDetail problem = problem(HttpStatus.INTERNAL_SERVER_ERROR, "internal_error",
        "Внутренняя ошибка сервера.", null);
    log.error("Непредвиденная ошибка [{}]", requestId(problem), e);
    return response(problem);
  }

  @Override
  protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body,
      HttpHeaders headers, HttpStatusCode statusCode, WebRequest request) {
    HttpStatus status = HttpStatus.resolve(statusCode.value());
    String code = status == null ? "http_" + statusCode.value() : status.name().toLowerCase();
    ProblemDetail problem = problem(statusCode, code, titleFor(status), ex.getLocalizedMessage());
    if (statusCode.value() >= 500) {
      log.error("MVC-ошибка [{}] {}", requestId(problem), code, ex);
    } else {
      log.warn("MVC-ошибка [{}] {}: {}", requestId(problem), code, ex.getMessage());
    }
    return ResponseEntity.status(statusCode)
        .headers(headers)
        .contentType(MediaType.APPLICATION_PROBLEM_JSON)
        .body(problem);
  }

  /** Клиентские заголовки по коду: наружу без технических деталей провайдера. */
  private static String aiTitle(String code) {
    return switch (code) {
      case AiClientException.NOT_CONFIGURED ->
          "Сервис генерации не настроен: отсутствует ключ модели. Обратитесь к администратору.";
      case AiClientException.REQUEST_FAILED ->
          "Не удалось получить результат от модели. Попробуйте повторить позже.";
      case AiClientException.BAD_RESPONSE ->
          "Модель вернула нечитаемый ответ. Попробуйте повторить позже.";
      default -> "Внутренняя ошибка сервера.";
    };
  }

  private static String titleFor(HttpStatus status) {
    if (status == null) {
      return "Ошибка запроса.";
    }
    return switch (status) {
      case METHOD_NOT_ALLOWED -> "Метод не поддерживается.";
      case UNSUPPORTED_MEDIA_TYPE -> "Формат запроса не поддерживается.";
      case NOT_ACCEPTABLE -> "Формат ответа не поддерживается.";
      case BAD_REQUEST -> "Некорректный запрос.";
      default -> status.getReasonPhrase();
    };
  }

  private static ProblemDetail problem(HttpStatusCode status, String code, String title,
      String detail) {
    ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
    problem.setType(PROBLEM_TYPE);
    problem.setTitle(title);
    problem.setProperty("code", code);
    problem.setProperty("requestId", UUID.randomUUID().toString());
    return problem;
  }

  private static String requestId(ProblemDetail problem) {
    return String.valueOf(problem.getProperties().get("requestId"));
  }

  private static ResponseEntity<ProblemDetail> response(ProblemDetail problem) {
    return ResponseEntity.status(problem.getStatus())
        .contentType(MediaType.APPLICATION_PROBLEM_JSON)
        .body(problem);
  }
}
