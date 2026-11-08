package com.adtune.backend.generation;

import static org.assertj.core.api.Assertions.assertThat;

import com.adtune.backend.ai.AdGenerationResult;
import com.adtune.backend.db.Channel;
import com.adtune.backend.db.ChannelVersion;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Обязательные поля формата фронта присутствуют и валидны, супернабор сохраняется. */
class StoredResultMapperTest {

  @Test
  void mapsFrontendShapeWithExtras() {
    String versionId = UUID.randomUUID().toString();
    String channelId = UUID.randomUUID().toString();
    String photoId = UUID.randomUUID().toString();
    AdGenerationResult ai = new AdGenerationResult(
        78,
        List.of(new AdGenerationResult.Reason(true, "Подробно описано расположение"),
            new AdGenerationResult.Reason(true, "Есть фото всех комнат"),
            new AdGenerationResult.Reason(false, "Нет фото санузла")),
        List.of("Добавьте фото санузла"),
        List.of(new AdGenerationResult.ChannelOutcome(
            versionId,
            List.of("Заголовок 1", "Заголовок 2"),
            "Текст объявления",
            List.of(true, false),
            new AdGenerationResult.PhotoPlan(
                List.of(new AdGenerationResult.TopPhoto(photoId, "Светлая комната")),
                List.of("other-1"), List.of()))));

    JsonNode stored = new StoredResultMapper().map(ai,
        Map.of(versionId, new StoredResultMapper.ChannelSnapshot(
            versionId, channelId, "Авито", "инструкция")));

    assertThat(stored.get("score").asInt()).isEqualTo(78);
    JsonNode channel = stored.get("channels").get(0);
    assertThat(channel.get("channelVersionId").asText()).isEqualTo(versionId);
    assertThat(channel.get("channel").get("id").asText()).isEqualTo(channelId);
    assertThat(channel.get("channel").get("name").asText()).isEqualTo("Авито");
    assertThat(channel.get("title").asText()).isEqualTo("Заголовок 1");
    assertThat(channel.get("titles")).hasSize(2);
    assertThat(channel.get("text").asText()).isEqualTo("Текст объявления");
    assertThat(channel.get("score").asInt()).isEqualTo(78);
    assertThat(channel.get("scoreReason").asText()).isEqualTo("Подробно описано расположение");
    assertThat(channel.get("photoIds").get(0).asText()).isEqualTo(photoId);
    assertThat(channel.get("photoIds")).hasSize(1);
    assertThat(channel.get("checklist")).hasSize(2);
    assertThat(channel.get("photos").get("top").get(0).get("photo_id").asText())
        .isEqualTo(photoId);
  }

  @Test
  void unknownChannelIsSkipped() {
    AdGenerationResult ai = new AdGenerationResult(50,
        List.of(new AdGenerationResult.Reason(true, "1"),
            new AdGenerationResult.Reason(true, "2"),
            new AdGenerationResult.Reason(false, "3")),
        List.of("совет"),
        List.of(new AdGenerationResult.ChannelOutcome(
            UUID.randomUUID().toString(), List.of("Заголовок"), "Текст",
            List.of(true),
            new AdGenerationResult.PhotoPlan(List.of(), List.of(), List.of()))));
    JsonNode stored = new StoredResultMapper().map(ai, Map.of());
    assertThat(stored.get("channels")).isEmpty();
  }
}
