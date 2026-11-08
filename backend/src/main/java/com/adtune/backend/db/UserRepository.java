package com.adtune.backend.db;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.repository.CrudRepository;

public interface UserRepository extends CrudRepository<AppUser, UUID> {

  Optional<AppUser> findByLogin(String login);

  boolean existsByLogin(String login);
}
