package com.adtune.backend.web;

import java.util.List;

/**
 * Доменная ошибка API: статус, стабильный код, человекочитаемый заголовок
 * и опциональные подробности (fieldErrors, currentVersion) — превращается
 * в problem+json обработчиком ошибок.
 */
public class ApiProblem extends RuntimeException {

  private final int status;
  private final String code;
  private final String title;
  private final List<FieldIssue> fieldErrors;
  private final Integer currentVersion;

  public ApiProblem(int status, String code, String title) {
    this(status, code, title, List.of(), null);
  }

  public ApiProblem(int status, String code, String title, List<FieldIssue> fieldErrors) {
    this(status, code, title, fieldErrors, null);
  }

  public ApiProblem(int status, String code, String title, List<FieldIssue> fieldErrors,
      Integer currentVersion) {
    super(title);
    this.status = status;
    this.code = code;
    this.title = title;
    this.fieldErrors = List.copyOf(fieldErrors);
    this.currentVersion = currentVersion;
  }

  /** 400 с ошибками полей формы (фронт показывает их у полей). */
  public static ApiProblem validation(List<FieldIssue> fieldErrors) {
    return new ApiProblem(400, "VALIDATION_ERROR", "Проверьте логин и пароль и попробуйте ещё раз.",
        fieldErrors);
  }

  /** 401 без/с истёкшей сессией. */
  public static ApiProblem unauthenticated() {
    return new ApiProblem(401, "UNAUTHENTICATED", "Требуется вход в аккаунт.");
  }

  /** 401 при неверном логине или пароле (код важен фронтенду). */
  public static ApiProblem invalidCredentials() {
    return new ApiProblem(401, "INVALID_CREDENTIALS", "Неверный логин или пароль");
  }

  public int status() {
    return status;
  }

  public String code() {
    return code;
  }

  public String title() {
    return title;
  }

  public List<FieldIssue> fieldErrors() {
    return fieldErrors;
  }

  public Integer currentVersion() {
    return currentVersion;
  }
}
