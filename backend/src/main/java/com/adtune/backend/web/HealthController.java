package com.adtune.backend.web;

import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Health-проверка для Docker Compose и CI. Формат зафиксирован
 * frontend/scripts/check-compose.mjs: 200 и status=ok.
 * Готовность теперь включает БД: пока база недоступна, сервис считается
 * нездоровым, и compose держит зависимые сервисы в ожидании.
 */
@RestController
public class HealthController {

  private final JdbcTemplate jdbc;

  public HealthController(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @GetMapping("/health")
  public ResponseEntity<Map<String, String>> health() {
    try {
      jdbc.queryForObject("SELECT 1", Integer.class);
      return ResponseEntity.ok(Map.of("status", "ok", "mode", "spring-boot", "db", "ok"));
    } catch (DataAccessException e) {
      return ResponseEntity.status(503)
          .body(Map.of("status", "error", "mode", "spring-boot", "db", "unavailable"));
    }
  }
}
