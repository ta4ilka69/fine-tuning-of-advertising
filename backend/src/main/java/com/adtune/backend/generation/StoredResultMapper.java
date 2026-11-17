package com.adtune.backend.generation;

import com.adtune.backend.ai.AdGenerationResult;
import com.adtune.backend.ai.AiClientException;
import com.adtune.backend.db.Channel;
import com.adtune.backend.db.ChannelVersion;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
    return map(ai, channels, null);
  }

  public ObjectNode map(AdGenerationResult ai, Map<String, ChannelSnapshot> channels,
      Set<String> allowedPhotoIds) {
    boolean strict = allowedPhotoIds != null;
    Set<String> seen = new HashSet<>();
    if (strict && (ai.score() < 0 || ai.score() > 100 || channels.isEmpty())) {
      throw invalidResult();
    }
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
        if (strict) {
          throw invalidResult();
        }
        log.warn("Модель вернула неизвестную площадку {}", outcome.channelId());
        continue;
      }
      if (strict) {
        if (!seen.add(outcome.channelId()) || outcome.titles().isEmpty()
            || outcome.titles().size() > 3) {
          throw invalidResult();
        }
      }
      AdGenerationResult.PhotoPlan photoPlan = strict
          ? normalizePhotos(outcome.photos(), allowedPhotoIds) : outcome.photos();
      List<String> boundedTitles = outcome.titles().stream()
          .map(title -> strict ? bounded(title, snapshot.titleLimit()) : title)
          .toList();
      ObjectNode node = channelNodes.addObject();
      node.put("channelVersionId", snapshot.versionId());
      ObjectNode channel = node.putObject("channel");
      channel.put("id", snapshot.channelId());
      channel.put("name", snapshot.channelName());
      node.put("title", boundedTitles.isEmpty() ? snapshot.channelName() : boundedTitles.get(0));
      ArrayNode titles = node.putArray("titles");
      boundedTitles.forEach(titles::add);
      node.put("text", strict ? bounded(outcome.text(), snapshot.textLimit()) : outcome.text());
      // Общая оценка объявления, пока модель не даёт отдельную по каждой площадке.
      node.put("score", ai.score());
      node.put("scoreReason", ai.why().stream().map(AdGenerationResult.Reason::text)
          .filter(reason -> reason != null && !reason.isBlank()).findFirst()
          .orElse("Результат готов"));
      ArrayNode photoIds = node.putArray("photoIds");
      photoPlan.top().stream().limit(3)
          .forEach(top -> photoIds.add(top.photoId()));
      node.set("checklist", mapper.valueToTree(outcome.checklist()));
      node.set("photos", mapper.valueToTree(photoPlan));
    }
    if (strict && !seen.equals(channels.keySet())) {
      throw invalidResult();
    }
    return root;
  }

  private static AdGenerationResult.PhotoPlan normalizePhotos(
      AdGenerationResult.PhotoPlan photos, Set<String> allowed) {
    if (photos == null) {
      return new AdGenerationResult.PhotoPlan(List.of(), List.of(), List.of());
    }
    Set<String> used = new HashSet<>();
    var top = photos.top().stream()
        .filter(photo -> photo.why() != null && !photo.why().isBlank())
        .filter(photo -> acceptPhoto(photo.photoId(), allowed, used))
        .limit(3)
        .toList();
    var excluded = photos.excluded().stream().filter(id -> acceptPhoto(id, allowed, used)).toList();
    var rest = photos.rest().stream().filter(id -> acceptPhoto(id, allowed, used)).toList();
    return new AdGenerationResult.PhotoPlan(top, rest, excluded);
  }

  private static boolean acceptPhoto(String id, Set<String> allowed, Set<String> used) {
    return id != null && allowed.contains(id) && used.add(id);
  }

  private static String bounded(String value, Integer limit) {
    if (value == null || value.isBlank()) {
      throw invalidResult();
    }
    String text = value.strip();
    if (limit == null || text.codePointCount(0, text.length()) <= limit) {
      return text;
    }
    int end = text.offsetByCodePoints(0, limit);
    if (!Character.isWhitespace(text.codePointAt(end))) {
      for (int i = end; i > 0; ) {
        int codePoint = text.codePointBefore(i);
        i -= Character.charCount(codePoint);
        if (Character.isWhitespace(codePoint)) {
          return text.substring(0, i).stripTrailing();
        }
      }
    }
    return text.substring(0, end).stripTrailing();
  }

  private static AiClientException invalidResult() {
    return new AiClientException(AiClientException.BAD_RESPONSE,
        "Модель вернула неполный или некорректный результат.");
  }

  /** Снимок площадки на момент запуска генерации. */
  public record ChannelSnapshot(String versionId, String channelId, String channelName,
      String instruction, Integer titleLimit, Integer textLimit) {

    public ChannelSnapshot(String versionId, String channelId, String channelName,
        String instruction) {
      this(versionId, channelId, channelName, instruction, null, null);
    }

    public static ChannelSnapshot of(Channel channel, ChannelVersion version) {
      return new ChannelSnapshot(version.getId().toString(), channel.getId().toString(),
          channel.getName(), version.getInstruction(), version.getTitleLimit(),
          version.getTextLimit());
    }
  }
}
