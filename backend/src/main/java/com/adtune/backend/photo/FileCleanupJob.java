package com.adtune.backend.photo;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Фоновая очистка: триггер схемы складывает ключи удалённых файлов в
 * file_cleanup (включая каскадные удаления), здесь они стираются из хранилища.
 */
@Component
public class FileCleanupJob {

  private static final Logger log = LoggerFactory.getLogger(FileCleanupJob.class);

  private final JdbcTemplate jdbc;
  private final PhotoStorage storage;

  public FileCleanupJob(JdbcTemplate jdbc, PhotoStorage storage) {
    this.jdbc = jdbc;
    this.storage = storage;
  }

  @Scheduled(fixedDelay = 30_000, initialDelay = 30_000)
  @Transactional
  public void cleanup() {
    List<String> keys = jdbc.queryForList(
        "SELECT file_key FROM file_cleanup ORDER BY created_at", String.class);
    for (String key : keys) {
      try {
        storage.delete(key);
      } catch (RuntimeException e) {
        log.warn("Не удалось удалить файл {} из хранилища, повторим позже: {}", key, e.getMessage());
        return;
      }
    }
    if (!keys.isEmpty()) {
      jdbc.update("DELETE FROM file_cleanup");
      log.info("Очистка хранилища: удалено {} файлов", keys.size());
    }
  }
}
