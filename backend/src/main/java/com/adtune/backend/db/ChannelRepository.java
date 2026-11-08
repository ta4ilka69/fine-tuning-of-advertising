package com.adtune.backend.db;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.repository.CrudRepository;

public interface ChannelRepository extends CrudRepository<Channel, UUID> {

  List<Channel> findByIsActiveTrueOrderByName();

  Optional<Channel> findByName(String name);
}
