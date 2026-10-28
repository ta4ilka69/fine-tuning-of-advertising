package com.adtune.backend.ai;

/** Ошибка при обращении к AI-модели или разборе её ответа. */
public class AiClientException extends RuntimeException {

  public static final String NOT_CONFIGURED = "ai_not_configured";
  public static final String REQUEST_FAILED = "ai_request_failed";
  public static final String BAD_RESPONSE = "ai_bad_response";

  private final String code;

  public AiClientException(String code, String message) {
    super(message);
    this.code = code;
  }

  public AiClientException(String code, String message, Throwable cause) {
    super(message, cause);
    this.code = code;
  }

  /** Код ошибки для клиентских ответов: {@code ai_not_configured} и т.п. */
  public String code() {
    return code;
  }
}
