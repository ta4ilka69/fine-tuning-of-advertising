package com.adtune.backend.web;

import com.adtune.backend.ai.AiClientException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Единый формат ошибок API: {"error": код, "message": понятное сообщение, "requestId": ...}.
 *
 * <p>Наследование от {@link ResponseEntityExceptionHandler} сохраняет корректные статусы
 * стандартных ошибок MVC (405 на неверный метод, 415 на неверный Content-Type и т.п.),
 * а catch-all ниже ловит только действительно неожиданные ошибки.
 *
 * <p>Технические детали (тексты ошибок провайдера, сетевые причины) наружу не отдаются —
 * только в лог вместе с requestId, который возвращается клиенту.
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

  private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

  @ExceptionHandler(AiClientException.class)
  public ResponseEntity<Map<String, String>> handleAiClient(AiClientException e) {
    String requestId = shortRequestId();
    log.error("AI-ошибка [{}] {}: {}", requestId, e.code(), e.getMessage(), e);
    HttpStatus status = AiClientException.NOT_CONFIGURED.equals(e.code())
        ? HttpStatus.SERVICE_UNAVAILABLE
        : HttpStatus.BAD_GATEWAY;
    return ResponseEntity.status(status)
        .body(body(e.code(), clientMessage(e.code()), requestId));
  }

  @ExceptionHandler(IllegalArgumentException.class)
  public ResponseEntity<Map<String, String>> handleBadRequest(IllegalArgumentException e) {
    return ResponseEntity.badRequest()
        .body(body("bad_request",
            e.getMessage() == null ? "Некорректный запрос." : e.getMessage(), null));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<Map<String, String>> handleUnexpected(Exception e) {
    String requestId = shortRequestId();
    log.error("Непредвиденная ошибка [{}]", requestId, e);
    return ResponseEntity.internalServerError()
        .body(body("internal_error", "Внутренняя ошибка сервера.", requestId));
  }

  @Override
  protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body,
      HttpHeaders headers, HttpStatusCode statusCode, WebRequest request) {
    HttpStatus status = HttpStatus.resolve(statusCode.value());
    String code = status == null ? "http_" + statusCode.value() : status.name().toLowerCase();
    return new ResponseEntity<>(body(code, ex.getLocalizedMessage(), null), headers, statusCode);
  }

  /** Клиентские тексты по коду: наружу без технических деталей провайдера. */
  private static String clientMessage(String code) {
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

  private static Map<String, String> body(String error, String message, String requestId) {
    Map<String, String> map = new LinkedHashMap<>();
    map.put("error", error);
    map.put("message", message);
    if (requestId != null) {
      map.put("requestId", requestId);
    }
    return map;
  }

  private static String shortRequestId() {
    return UUID.randomUUID().toString().substring(0, 8);
  }
}
