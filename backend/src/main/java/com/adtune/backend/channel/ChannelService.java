package com.adtune.backend.channel;

import com.adtune.backend.db.Channel;
import com.adtune.backend.db.ChannelRepository;
import com.adtune.backend.db.ChannelVersion;
import com.adtune.backend.db.ChannelVersionRepository;
import com.adtune.backend.web.ApiProblem;
import com.adtune.backend.web.FieldIssue;
import java.util.List;
import java.util.UUID;
import java.util.stream.StreamSupport;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ChannelService {

  private final ChannelRepository channels;
  private final ChannelVersionRepository versions;
  private final JdbcTemplate jdbc;

  public ChannelService(ChannelRepository channels, ChannelVersionRepository versions,
      JdbcTemplate jdbc) {
    this.channels = channels;
    this.versions = versions;
    this.jdbc = jdbc;
  }

  public record Limits(Integer titleLimit, Integer textLimit) {}

  public record ChannelView(UUID id, String name, String description, Limits limits, int number) {}

  public record AdminView(UUID id, String name, String description, Limits limits, int number,
      String instruction, List<String> checklist, boolean isActive) {}

  @Transactional(readOnly = true)
  public List<ChannelView> active() {
    return channels.findByIsActiveTrueOrderByName().stream().map(channel -> {
      ChannelVersion version = currentVersion(channel.getCurrentVersionId());
      return new ChannelView(channel.getId(), channel.getName(), channel.getDescription(),
          limits(version), version.getNumber());
    }).toList();
  }

  @Transactional(readOnly = true)
  public List<AdminView> all() {
    return StreamSupport.stream(channels.findAll().spliterator(), false)
        .sorted(java.util.Comparator.comparing(Channel::getName))
        .map(channel -> adminView(channel.getId(), channel.getName(), channel.getDescription(),
            channel.isActive(), currentVersion(channel.getCurrentVersionId())))
        .toList();
  }

  @Transactional
  public AdminView create(ChannelInput input) {
    ChannelVersion version = version(null, 1, input);
    Channel channel = Channel.create(input.name(), input.description(), version.getId());
    try {
      jdbc.update("""
          INSERT INTO channel (id, name, description, is_active, current_version_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
          """, channel.getId(), input.name(), input.description(), input.active(),
          version.getId(), channel.getCreatedAt());
    } catch (DuplicateKeyException e) {
      throw nameTaken();
    }
    version.setChannelId(channel.getId());
    versions.save(version);
    return adminView(channel.getId(), input.name(), input.description(), input.active(), version);
  }

  @Transactional(isolation = Isolation.READ_COMMITTED)
  public AdminView update(UUID id, ChannelInput input) {
    UUID currentVersionId = jdbc.query("""
        SELECT current_version_id FROM channel WHERE id = ? FOR UPDATE
        """, (rs, row) -> rs.getObject("current_version_id", UUID.class), id).stream()
        .findFirst()
        .orElseThrow(() -> new ApiProblem(404, "NOT_FOUND", "Площадка не найдена."));
    int currentNumber = currentVersion(currentVersionId).getNumber();
    if (currentNumber != input.expectedNumber()) {
      throw new ApiProblem(409, "VERSION_CONFLICT",
          "Площадка уже изменена. Загрузите актуальные настройки.", List.of(), currentNumber);
    }
    ChannelVersion version = version(id, currentNumber + 1, input);
    versions.save(version);
    try {
      jdbc.update("""
          UPDATE channel SET name = ?, description = ?, is_active = ?, current_version_id = ?
          WHERE id = ?
          """, input.name(), input.description(), input.active(), version.getId(), id);
    } catch (DuplicateKeyException e) {
      throw nameTaken();
    }
    return adminView(id, input.name(), input.description(), input.active(), version);
  }

  private ChannelVersion currentVersion(UUID id) {
    return versions.findById(id).orElseThrow();
  }

  private static ChannelVersion version(UUID channelId, int number, ChannelInput input) {
    return ChannelVersion.create(channelId, number, input.instruction(), input.checklist(),
        input.titleLimit(), input.textLimit());
  }

  private static AdminView adminView(UUID id, String name, String description, boolean active,
      ChannelVersion version) {
    return new AdminView(id, name, description, limits(version), version.getNumber(),
        version.getInstruction(), version.getChecklist(), active);
  }

  private static Limits limits(ChannelVersion version) {
    return new Limits(version.getTitleLimit(), version.getTextLimit());
  }

  private static ApiProblem nameTaken() {
    String message = "Площадка с таким названием уже есть.";
    return new ApiProblem(409, "CHANNEL_NAME_TAKEN", message,
        List.of(new FieldIssue("DUPLICATE", "/name", message)));
  }
}
