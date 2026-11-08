package com.adtune.backend.generation;

import com.adtune.backend.ai.AdGenerationResult;
import com.adtune.backend.db.Channel;
import com.adtune.backend.db.ChannelVersion;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Результат модели → JSON для listing.result. Обязательные поля — формат
 * фронтенда (frontend/src/shared/api/types.ts GenerationResult): каналы с
 * channelVersionId, channel{id,name}, title, text, score, scoreReason,
 * photoIds (≤3). Дополнительно сохраняем общий score, причины, советы,
 * все заголовки и план фото — фронтенд лишние поля игнорирует.
 */
@Component
public class StoredResultMapper {

  private static final Logger log = LoggerFactory.getLogger(StoredResultMapper.class);
  private final ObjectMapper mapper = new ObjectMapper();

  /** key — идентификатор версии площадки, который уходил в модель. */
  public ObjectNode map(AdGenerationResult ai, Map<String, ChannelSnapshot> channels) {
    ObjectNode root = mapper.createObjectNode();
    root.put("score", ai.score());
    ArrayNode why = root.putArray("why");
    ai.why().forEach(reason -> {
      ObjectNode node = why.addObject();
      node.put("plus", reason.plus());
      node.put("text", reason.text());
    });
    ArrayNode improve = root.putArray("howToImprove");
    ai.howToImprove().forEach(improve::add);

    ArrayNode channelNodes = root.putArray("channels");
    for (AdGenerationResult.ChannelOutcome outcome : ai.channels()) {
      ChannelSnapshot snapshot = channels.get(outcome.channelId());
      if (snapshot == null) {
        log.warn("Модель вернула неизвестную площадку {}", outcome.channelId());
        continue;
      }
      ObjectNode node = channelNodes.addObject();
      node.put("channelVersionId", snapshot.versionId());
      ObjectNode channel = node.putObject("channel");
      channel.put("id", snapshot.channelId());
      channel.put("name", snapshot.channelName());
      node.put("title", outcome.titles().isEmpty() ? snapshot.channelName() : outcome.titles().get(0));
      ArrayNode titles = node.putArray("titles");
      outcome.titles().forEach(titles::add);
      node.put("text", outcome.text());
      // Общая оценка объявления, пока модель не даёт отдельную по каждой площадке.
      node.put("score", ai.score());
      node.put("scoreReason",
          ai.why().isEmpty() ? "Результат готов" : ai.why().get(0).text());
      ArrayNode photoIds = node.putArray("photoIds");
      outcome.photos().top().stream().limit(3)
          .forEach(top -> photoIds.add(top.photoId()));
      node.set("checklist", mapper.valueToTree(outcome.checklist()));
      node.set("photos", mapper.valueToTree(outcome.photos()));
    }
    return root;
  }

  /** Снимок площадки на момент запуска генерации. */
  public record ChannelSnapshot(String versionId, String channelId, String channelName,
      String instruction) {

    public static ChannelSnapshot of(Channel channel, ChannelVersion version) {
      return new ChannelSnapshot(version.getId().toString(), channel.getId().toString(),
          channel.getName(), version.getInstruction());
    }
  }
}
