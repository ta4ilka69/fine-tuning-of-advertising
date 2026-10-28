package com.adtune.backend.config;

import com.adtune.backend.ai.AdGenerationClient;
import com.adtune.backend.ai.SystemPromptBuilder;
import com.adtune.backend.ai.openai.OpenAiAdGenerationClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/**
 * Собирает клиент выбранного провайдера. Новая нейронка = новая имплементация
 * {@link AdGenerationClient} с собственным условием по {@code adtune.ai.provider}.
 */
@Configuration
@EnableConfigurationProperties(AiProperties.class)
public class AiClientConfig {

  /**
   * Wire-формат OpenAI использует snake_case (response_format и т.п.), поэтому
   * маппер создаётся локально и не попадает в контекст как бин — MVC-сериализация
   * на него не переключается.
   */
  @Bean
  @ConditionalOnProperty(prefix = "adtune.ai", name = "provider",
      havingValue = "openai", matchIfMissing = true)
  public AdGenerationClient openAiAdGenerationClient(RestClient.Builder restClientBuilder,
      AiProperties properties,
      SystemPromptBuilder promptBuilder) {
    AiProperties.OpenAi openAi = properties.openai();
    ObjectMapper wireMapper = OpenAiAdGenerationClient.wireMapper();
    RestClient restClient = OpenAiAdGenerationClient.configureRestClient(
            restClientBuilder, openAi.baseUrl(), openAi.apiKey(),
            properties.timeout(), wireMapper)
        .build();
    return new OpenAiAdGenerationClient(restClient, openAi, promptBuilder, wireMapper);
  }
}
