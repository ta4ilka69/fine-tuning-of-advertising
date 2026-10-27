package com.adtune.backend.web;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Health-проверка для Docker Compose и CI. Формат зафиксирован
 * frontend/scripts/check-compose.mjs: 200 и status=ok.
 */
@RestController
public class HealthController {

  @GetMapping("/health")
  public Map<String, String> health() {
    return Map.of("status", "ok", "mode", "spring-boot");
  }
}
