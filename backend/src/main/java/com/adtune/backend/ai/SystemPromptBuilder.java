package com.adtune.backend.ai;

/**
 * Собирает промпты для модели. Вынесен в интерфейс, чтобы позже поддержать
 * редактируемые системные промпты площадок и персональные дополнения агентов,
 * не меняя имплементации клиентов.
 */
public interface SystemPromptBuilder {

  /** Системный промпт с постановкой задачи и общими правилами. */
  String buildSystemPrompt();

  /** Пользовательское сообщение: исходные данные и уточнения. */
  String buildUserPrompt(AdGenerationRequest request);
}
