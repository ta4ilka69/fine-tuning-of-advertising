package com.adtune.backend.db;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.repository.CrudRepository;

public interface PhotoRepository extends CrudRepository<Photo, UUID> {

  List<Photo> findByListingIdOrderByIdAsc(UUID listingId);

  long countByListingId(UUID listingId);

  Optional<Photo> findByIdAndListingId(UUID id, UUID listingId);
}
