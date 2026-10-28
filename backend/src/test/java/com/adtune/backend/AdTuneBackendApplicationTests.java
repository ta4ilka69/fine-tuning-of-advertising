package com.adtune.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

/** Проверяет, что контекст поднимается без реального ключа модели. */
@SpringBootTest(properties = "adtune.ai.openai.api-key=test-key")
class AdTuneBackendApplicationTests {

  @Test
  void contextLoads() {
  }
}
