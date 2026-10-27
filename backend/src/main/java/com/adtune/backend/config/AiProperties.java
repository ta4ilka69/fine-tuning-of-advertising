package com.adtune.backend.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Настройки AI-слоя. Значения берутся из переменных окружения
 * (см. application.yml и backend/.env.example).
 *
 * @param provider какой клиент использовать; соответствует условию
 *                 {@code @ConditionalOnProperty} в {@link AiClientConfig}
 * @param timeout  таймаут одного обращения к модели
 */
@ConfigurationProperties(prefix = "adtune.ai")
public record AiProperties(String provider, Duration timeout, OpenAi openai) {

  /**
   * Настройки OpenAI-совместимого API.
   *
   * @param reasoningEffort глубина «размышлений» модели (minimal/low/medium/high);
   *                        null или пусто — параметр не отправляется (нужно для
   *                        моделей без поддержки, например gpt-4o)
   */
  public record OpenAi(String baseUrl, String apiKey, String model, String reasoningEffort) {
  }
}
