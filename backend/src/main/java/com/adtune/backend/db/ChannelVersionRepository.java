package com.adtune.backend.db;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.repository.CrudRepository;

public interface ChannelVersionRepository extends CrudRepository<ChannelVersion, UUID> {

  Optional<ChannelVersion> findFirstByChannelIdOrderByNumberDesc(UUID channelId);

  List<ChannelVersion> findByChannelIdOrderByNumberDesc(UUID channelId);
}
