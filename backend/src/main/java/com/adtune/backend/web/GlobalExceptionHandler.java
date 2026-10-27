package com.adtune.backend.web;

import com.adtune.backend.ai.AiClientException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

/** Единый формат ошибок API: {"error": код, "message": понятное сообщение}. */
@RestControllerAdvice
public class GlobalExceptionHandler {

  private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

  @ExceptionHandler(AiClientException.class)
  public ResponseEntity<Map<String, String>> handleAiClient(AiClientException e) {
    int status = switch (e.code()) {
      case AiClientException.NOT_CONFIGURED -> 503;
      default -> 502;
    };
    return ResponseEntity.status(status)
        .body(Map.of("error", e.code(), "message", e.getMessage()));
  }

  @ExceptionHandler({IllegalArgumentException.class, HttpMessageNotReadableException.class})
  public ResponseEntity<Map<String, String>> handleBadRequest(Exception e) {
    return ResponseEntity.badRequest()
        .body(Map.of("error", "bad_request", "message",
            e.getMessage() == null ? "Некорректный запрос." : e.getMessage()));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<Map<String, String>> handleUnexpected(Exception e) {
    log.error("Непредвиденная ошибка", e);
    return ResponseEntity.internalServerError()
        .body(Map.of("error", "internal_error", "message", "Внутренняя ошибка сервера."));
  }
}
