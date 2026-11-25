package com.adtune.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

/**
 * Разбор adtune.ai из application.yml: модель и reasoning_effort у генерации
 * и обработки фото настраиваются отдельно, а без специфичных переменных обе
 * задачи берут общие OPENAI_MODEL / OPENAI_REASONING_EFFORT.
 */
class AiPropertiesBindingTest {

  private final ApplicationContextRunner runner = new ApplicationContextRunner()
      .withInitializer(new ConfigDataApplicationContextInitializer())
      .withUserConfiguration(PropertiesOnly.class);

  @Test
  void tasksFallBackToCommonModelVars() {
    runner.withPropertyValues(
            "OPENAI_MODEL=gpt-common", "OPENAI_REASONING_EFFORT=medium")
        .run(context -> {
          AiProperties.OpenAi.Model expected =
              new AiProperties.OpenAi.Model("gpt-common", "medium");
          AiProperties.OpenAi openAi = context.getBean(AiProperties.class).openai();
          assertThat(openAi.generation()).isEqualTo(expected);
          assertThat(openAi.photo()).isEqualTo(expected);
        });
  }

  @Test
  void taskSpecificVarsOverrideOnlyTheirTask() {
    runner.withPropertyValues(
            "OPENAI_MODEL=gpt-common", "OPENAI_REASONING_EFFORT=medium",
            "OPENAI_GENERATION_MODEL=gpt-gen", "OPENAI_GENERATION_REASONING_EFFORT=high",
            "OPENAI_PHOTO_MODEL=gpt-photo", "OPENAI_PHOTO_REASONING_EFFORT=")
        .run(context -> {
          AiProperties.OpenAi openAi = context.getBean(AiProperties.class).openai();
          assertThat(openAi.generation()).isEqualTo(new AiProperties.OpenAi.Model("gpt-gen", "high"));
          assertThat(openAi.photo().model()).isEqualTo("gpt-photo");
          assertThat(openAi.photo().reasoningEffort()).isNullOrEmpty();
        });
  }

  @Configuration
  @EnableConfigurationProperties(AiProperties.class)
  static class PropertiesOnly {
  }
}
