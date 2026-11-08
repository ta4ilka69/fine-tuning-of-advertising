package com.adtune.backend.db;

import java.time.OffsetDateTime;
import org.springframework.data.repository.CrudRepository;
import org.springframework.transaction.annotation.Transactional;

public interface SessionRepository extends CrudRepository<Session, byte[]> {

  @Transactional
  void deleteByExpiresAtBefore(OffsetDateTime moment);
}
