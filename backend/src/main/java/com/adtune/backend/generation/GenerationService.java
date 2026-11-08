package com.adtune.backend.generation;

import com.adtune.backend.ai.AdGenerationClient;
import com.adtune.backend.ai.AdGenerationRequest;
import com.adtune.backend.ai.AdGenerationResult;
import com.adtune.backend.ai.AiClientException;
import com.adtune.backend.ai.ChannelAiInput;
import com.adtune.backend.ai.PhotoAiInput;
import com.adtune.backend.auth.AuthService;
import com.adtune.backend.db.AppUser;
import com.adtune.backend.db.Channel;
import com.adtune.backend.db.ChannelRepository;
import com.adtune.backend.db.ChannelVersion;
import com.adtune.backend.db.ChannelVersionRepository;
import com.adtune.backend.db.Listing;
import com.adtune.backend.db.ListingRepository;
import com.adtune.backend.db.ListingStatus;
import com.adtune.backend.db.Photo;
import com.adtune.backend.db.PhotoRepository;
import com.adtune.backend.db.PhotoStatus;
import com.adtune.backend.listing.ListingView;
import com.adtune.backend.web.ApiProblem;
import com.adtune.backend.web.FieldIssue;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Жизненный цикл генерации: валидация данных и фото, атомарный перевод в
 * generating (блокирует правки), фоновый вызов модели и запись результата.
 * Бюджет из схемы — 50 секунд; зависшие генерации сбрасывает подметальщик.
 */
@Service
public class GenerationService {

  private static final Logger log = LoggerFactory.getLogger(GenerationService.class);

  private final ListingRepository listings;
  private final PhotoRepository photos;
  private final ChannelRepository channels;
  private final ChannelVersionRepository channelVersions;
  private final AdGenerationClient adGenerationClient;
  private final StoredResultMapper resultMapper;
  private final com.adtune.backend.photo.PhotoService photoService;
  private final ExecutorService executor;
  private final JdbcTemplate jdbc;
  @Value("${adtune.ai-tasks.async:true}")
  private boolean async;

  public GenerationService(ListingRepository listings, PhotoRepository photos,
      ChannelRepository channels, ChannelVersionRepository channelVersions,
      AdGenerationClient adGenerationClient, StoredResultMapper resultMapper,
      com.adtune.backend.photo.PhotoService photoService,
      @Qualifier("aiExecutor") ExecutorService executor, JdbcTemplate jdbc) {
    this.listings = listings;
    this.photos = photos;
    this.channels = channels;
    this.channelVersions = channelVersions;
    this.adGenerationClient = adGenerationClient;
    this.resultMapper = resultMapper;
    this.photoService = photoService;
    this.executor = executor;
    this.jdbc = jdbc;
  }

  /** Запуск: 202 с объявлением в статусе generating (или готовым при синхронном режиме). */
  @Transactional
  public ListingView start(AppUser user, UUID listingId, int expectedVersion,
      List<UUID> requestedChannelIds) {
    Listing listing = listings.findByIdAndUserId(listingId, user.getId())
        .orElseThrow(() -> new ApiProblem(404, "NOT_FOUND", "Объявление не найдено."));
    if (listing.getStatus() == ListingStatus.generating) {
      throw new ApiProblem(409, "LISTING_BUSY",
          "Идёт генерация. Дождитесь её завершения.", List.of(), listing.getVersion());
    }
    if (listing.getVersion() != expectedVersion) {
      throw new ApiProblem(409, "VERSION_CONFLICT",
          "Объявление изменилось. Загрузите текущую версию.", List.of(), listing.getVersion());
    }

    List<Channel> selected = selectChannels(requestedChannelIds);
    validateReadyForGeneration(listing);

    int rows = listings.markGenerating(listingId, user.getId(), expectedVersion,
        OffsetDateTime.now());
    if (rows == 0) {
      Listing fresh = listings.findByIdAndUserId(listingId, user.getId()).orElse(null);
      if (fresh == null) {
        throw new ApiProblem(404, "NOT_FOUND", "Объявление не найдено.");
      }
      if (fresh.getStatus() == ListingStatus.generating) {
        throw new ApiProblem(409, "LISTING_BUSY",
            "Идёт генерация. Дождитесь её завершения.", List.of(), fresh.getVersion());
      }
      throw new ApiProblem(409, "VERSION_CONFLICT",
          "Объявление изменилось. Загрузите текущую версию.", List.of(), fresh.getVersion());
    }

    GenerationTask task = snapshot(listing, selected);
    Runnable run = () -> {
      try {
        runGeneration(task);
      } catch (Exception e) {
        log.error("Генерация объявления {} упала неожиданно", listingId, e);
        listings.failGeneration(listingId, "Внутренняя ошибка при генерации.");
      }
    };
    if (!async) {
      run.run();
    } else if (org.springframework.transaction.support.TransactionSynchronizationManager
        .isSynchronizationActive()) {
      org.springframework.transaction.support.TransactionSynchronizationManager
          .registerSynchronization(new org.springframework.transaction.support.TransactionSynchronization() {
            @Override
            public void afterCommit() {
              executor.submit(run);
            }
          });
    } else {
      executor.submit(run);
    }
    return ListingView.of(listings.findById(listingId).orElseThrow(),
        photoService.viewsOf(listingId));
  }

  /** Восстановление после перезапуска: генерации старше бюджета сбрасываются. */
  @Scheduled(fixedDelay = 20_000, initialDelay = 40_000)
  @Transactional
  public void sweepExpired() {
    int rows = listings.failExpiredGenerations(OffsetDateTime.now().minusSeconds(55));
    if (rows > 0) {
      log.warn("Сброшено зависших генераций: {}", rows);
    }
  }

  private void runGeneration(GenerationTask task) {
    AdGenerationResult result;
    try {
      result = adGenerationClient.generate(task.request());
    } catch (AiClientException e) {
      log.error("Генерация объявления {} не удалась: {}", task.listingId(), e.getMessage());
      listings.failGeneration(task.listingId(), e.getMessage());
      return;
    }
    JsonNode stored = resultMapper.map(result, task.channels());
    listings.succeedGeneration(task.listingId(), stored.toString());
    log.info("Генерация объявления {} завершена: score={}", task.listingId(), result.score());
  }

  private void validateReadyForGeneration(Listing listing) {
    List<FieldIssue> issues = new ArrayList<>();
    JsonNode data = listing.getData();
    if (!data.path("location").path("address").isTextual()
        || data.path("location").path("address").asText().isBlank()) {
      issues.add(new FieldIssue("REQUIRED", "/data/location/address", "Укажите адрес объекта"));
    }
    JsonNode price = data.path("deal").path("price");
    if (!price.isNumber() || price.asDouble() <= 0) {
      issues.add(new FieldIssue("REQUIRED", "/data/deal/price", "Укажите цену"));
    }
    String deal = data.path("deal").path("type").asText("");
    if (!Set.of("sale", "rent", "daily_rent").contains(deal)) {
      issues.add(new FieldIssue("REQUIRED", "/data/deal/type", "Укажите тип сделки"));
    }
    List<Photo> notReady = photos.findByListingIdOrderByIdAsc(listing.getId()).stream()
        .filter(photo -> photo.getStatus() != PhotoStatus.ready)
        .toList();
    if (!notReady.isEmpty()) {
      issues.add(new FieldIssue("NOT_READY", "/photos",
          "Дождитесь обработки фотографий или удалите сбойные (не готовы: "
              + notReady.size() + ")"));
    }
    if (!issues.isEmpty()) {
      throw new ApiProblem(422, "VALIDATION_FAILED", "Проверьте данные объявления.", issues);
    }
  }

  private List<Channel> selectChannels(List<UUID> requested) {
    List<Channel> active = channels.findByIsActiveTrueOrderByName();
    if (requested == null || requested.isEmpty()) {
      if (active.isEmpty()) {
        throw new ApiProblem(422, "VALIDATION_FAILED",
            "Нет активных площадок для генерации.",
            List.of(new FieldIssue("REQUIRED", "/channelIds", "Выберите хотя бы одну площадку")));
      }
      return active;
    }
    Map<UUID, Channel> byId = new LinkedHashMap<>();
    active.forEach(channel -> byId.put(channel.getId(), channel));
    List<Channel> selected = new ArrayList<>();
    List<FieldIssue> issues = new ArrayList<>();
    for (UUID id : requested) {
      Channel channel = byId.get(id);
      if (channel == null) {
        issues.add(new FieldIssue("INVALID", "/channelIds",
            "Площадка недоступна: " + id));
      } else {
        selected.add(channel);
      }
    }
    if (!issues.isEmpty() || selected.isEmpty()) {
      throw new ApiProblem(422, "VALIDATION_FAILED",
          "Проверьте выбранные площадки.", issues.isEmpty()
              ? List.of(new FieldIssue("REQUIRED", "/channelIds", "Выберите хотя бы одну площадку"))
              : issues);
    }
    return selected;
  }

  /** Исходные данные фиксируются на момент запуска; версии площадок неизменяемы. */
  private GenerationTask snapshot(Listing listing, List<Channel> selected) {
    Map<String, StoredResultMapper.ChannelSnapshot> snapshots = new HashMap<>();
    List<ChannelAiInput> channelInputs = new ArrayList<>();
    for (Channel channel : selected) {
      ChannelVersion version = channelVersions.findById(channel.getCurrentVersionId())
          .orElseThrow(() -> new IllegalStateException(
              "У площадки " + channel.getName() + " нет текущей версии"));
      snapshots.put(version.getId().toString(),
          StoredResultMapper.ChannelSnapshot.of(channel, version));
      channelInputs.add(new ChannelAiInput(
          version.getId().toString(), channel.getName(), version.getInstruction(),
          version.getChecklist(), version.getTitleLimit(), version.getTextLimit()));
    }
    List<PhotoAiInput> photoInputs = photos.findByListingIdOrderByIdAsc(listing.getId())
        .stream()
        .map(photo -> new PhotoAiInput(photo.getId().toString(), describe(photo)))
        .toList();
    AdGenerationRequest request = new AdGenerationRequest(
        listing.getData(), photoInputs, channelInputs, null);
    return new GenerationTask(listing.getId(), request, snapshots);
  }

  private String describe(Photo photo) {
    String scene = photo.getScene() == null ? "" : photo.getScene().trim();
    String reason = photo.getQualityReason() == null ? "" : photo.getQualityReason().trim();
    return scene.isEmpty() ? reason : (reason.isEmpty() ? scene : scene + ". " + reason);
  }

  private record GenerationTask(UUID listingId, AdGenerationRequest request,
      Map<String, StoredResultMapper.ChannelSnapshot> channels) {
  }
}
