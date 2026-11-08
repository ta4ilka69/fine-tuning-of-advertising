package com.adtune.backend.db;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.repository.CrudRepository;

public interface ListingRepository extends CrudRepository<Listing, UUID> {

  List<Listing> findByUserIdOrderByUpdatedAtDescIdDesc(UUID userId);

  Optional<Listing> findByIdAndUserId(UUID id, UUID userId);
}
