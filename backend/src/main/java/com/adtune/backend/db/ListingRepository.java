package com.adtune.backend.db;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jdbc.repository.query.Modifying;
import org.springframework.data.jdbc.repository.query.Query;
import org.springframework.data.repository.CrudRepository;

public interface ListingRepository extends CrudRepository<Listing, UUID> {

  String GENERATION_TIMEOUT = "Генерация не завершилась в отведённое время.";

  List<Listing> findByUserIdOrderByUpdatedAtDescIdDesc(UUID userId);

  Optional<Listing> findByIdAndUserId(UUID id, UUID userId);

  /**
   * Правка данных: растит версию, сбрасывает в draft (старый результат сохраняется).
   * Возвращает 0 строк при чужом объявлении, устаревшей версии или во время генерации.
   */
  @Modifying
  @Query("""
      UPDATE listing SET data = CAST(:data AS jsonb), status = 'draft',
        version = version + 1, updated_at = :updatedAt,
        generation_error = NULL, generation_started_at = NULL
      WHERE id = :id AND user_id = :userId AND version = :expectedVersion
        AND status <> 'generating'
      """)
  int updateData(UUID id, UUID userId, int expectedVersion, String data,
      OffsetDateTime updatedAt);

  @Modifying
  @Query("""
      DELETE FROM listing
      WHERE id = :id AND user_id = :userId AND version = :expectedVersion
        AND status <> 'generating'
      """)
  int deleteByIdAndUserIdAndVersion(UUID id, UUID userId, int expectedVersion);

  /** Запуск генерации: атомарно занимает объявление, если версия сошлась. */
  @Modifying
  @Query("""
      UPDATE listing SET status = 'generating', generation_started_at = :startedAt,
        generation_error = NULL
      WHERE id = :id AND user_id = :userId AND version = :expectedVersion
        AND status <> 'generating'
      """)
  int markGenerating(UUID id, UUID userId, int expectedVersion, OffsetDateTime startedAt);

  /** Успешная генерация: результат перезаписывается, ошибка сбрасывается. */
  @Modifying
  @Query("""
      UPDATE listing SET status = 'ready', result = CAST(:result AS jsonb),
        generation_error = NULL, generation_started_at = NULL
      WHERE id = :id AND status = 'generating'
        AND generation_started_at = :startedAt
        AND generation_started_at > clock_timestamp() - interval '50 seconds'
      """)
  int succeedGeneration(UUID id, OffsetDateTime startedAt, String result);

  /** Неудачная генерация: статус failed с причиной; прошлый результат сохраняется. */
  @Modifying
  @Query("""
      UPDATE listing SET status = 'failed',
        generation_error = CASE
          WHEN generation_started_at <= clock_timestamp() - interval '50 seconds'
          THEN :timeoutError ELSE :error END,
        generation_started_at = NULL
      WHERE id = :id AND status = 'generating'
        AND generation_started_at = :startedAt
      """)
  int failGeneration(UUID id, OffsetDateTime startedAt, String error, String timeoutError);

  /** Страховка перезапусков: генерация дольше бюджета сбрасывается в failed. */
  @Modifying
  @Query("""
      UPDATE listing SET status = 'failed', generation_error = :timeoutError,
        generation_started_at = NULL
      WHERE status = 'generating'
        AND generation_started_at <= clock_timestamp() - interval '50 seconds'
      """)
  int failExpiredGenerations(String timeoutError);

  /** Действия с фото тоже меняют объявление: версия растёт, updated_at обновляется. */
  @Modifying
  @Query("""
      UPDATE listing SET version = version + 1, updated_at = :updatedAt,
        status = 'draft', generation_error = NULL, generation_started_at = NULL
      WHERE id = :id AND user_id = :userId AND version = :expectedVersion
        AND status <> 'generating'
      """)
  int bumpVersion(UUID id, UUID userId, int expectedVersion, OffsetDateTime updatedAt);
}
