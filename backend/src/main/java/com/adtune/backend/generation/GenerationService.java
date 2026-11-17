package com.adtune.backend.generation;

import com.adtune.backend.ai.AdGenerationClient;
import com.adtune.backend.ai.AdGenerationRequest;
import com.adtune.backend.ai.AdGenerationResult;
import com.adtune.backend.ai.AiClientException;
import com.adtune.backend.ai.ChannelAiInput;
import com.adtune.backend.ai.PhotoAiInput;
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
import com.adtune.backend.listing.ListingView;
import com.adtune.backend.web.ApiProblem;
import com.adtune.backend.web.FieldIssue;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
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
  @Value("${adtune.ai-tasks.async:true}")
  private boolean async;

  public GenerationService(ListingRepository listings, PhotoRepository photos,
      ChannelRepository channels, ChannelVersionRepository channelVersions,
      AdGenerationClient adGenerationClient, StoredResultMapper resultMapper,
      com.adtune.backend.photo.PhotoService photoService,
      @Qualifier("aiExecutor") ExecutorService executor) {
    this.listings = listings;
    this.photos = photos;
    this.channels = channels;
    this.channelVersions = channelVersions;
    this.adGenerationClient = adGenerationClient;
    this.resultMapper = resultMapper;
    this.photoService = photoService;
    this.executor = executor;
  }

  /** Запуск: 202 с объявлением в статусе generating (или готовым при синхронном режиме). */
  @Transactional
  public ListingView start(AppUser user, UUID listingId, int expectedVersion,
      List<UUID> requestedChannelIds) {
    Listing listing = requireEditable(user, listingId, expectedVersion);
    List<Channel> selected = selectChannels(requestedChannelIds);
    List<Photo> listingPhotos = photos.findByListingIdOrderByIdAsc(listingId);
    GenerationValidation.Report report = GenerationValidation.validate(listing, listingPhotos);
    if (!report.canGenerate()) {
      throw new ApiProblem(422, "VALIDATION_FAILED", "Проверьте данные объявления.", report.errors());
    }

    OffsetDateTime startedAt = OffsetDateTime.now().truncatedTo(ChronoUnit.MICROS);
    int rows = listings.markGenerating(listingId, user.getId(), expectedVersion, startedAt);
    if (rows == 0) {
      Listing fresh = requireEditable(user, listingId, expectedVersion);
      throw new ApiProblem(409, "VERSION_CONFLICT",
          "Объявление изменилось. Загрузите текущую версию.", List.of(), fresh.getVersion());
    }

    GenerationTask task = snapshot(listing, listingPhotos, selected, startedAt);
    Runnable run = () -> {
      try {
        runGeneration(task);
      } catch (Exception e) {
        log.error("Генерация объявления {} упала неожиданно", listingId, e);
        fail(task, "Внутренняя ошибка при генерации.");
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
  @Scheduled(fixedDelay = 1_000, initialDelay = 1_000)
  @Transactional
  public void sweepExpired() {
    int rows = listings.failExpiredGenerations(ListingRepository.GENERATION_TIMEOUT);
    if (rows > 0) {
      log.warn("Сброшено зависших генераций: {}", rows);
    }
  }

  private void runGeneration(GenerationTask task) {
    if (!OffsetDateTime.now().isBefore(task.startedAt().plusSeconds(50))) {
      fail(task, ListingRepository.GENERATION_TIMEOUT);
      return;
    }
    AdGenerationResult result;
    try {
      result = adGenerationClient.generate(task.request());
    } catch (AiClientException e) {
      log.error("Генерация объявления {} не удалась: {}", task.listingId(), e.getMessage());
      fail(task, "Не удалось получить результат от модели. Попробуйте ещё раз.");
      return;
    }
    var allowedPhotoIds = task.request().photos().stream()
        .map(PhotoAiInput::photoId)
        .collect(Collectors.toSet());
    JsonNode stored = resultMapper.map(result, task.channels(), allowedPhotoIds);
    if (listings.succeedGeneration(task.listingId(), task.startedAt(), stored.toString()) == 0) {
      fail(task, ListingRepository.GENERATION_TIMEOUT);
      return;
    }
    log.info("Генерация объявления {} завершена: score={}", task.listingId(), result.score());
  }

  private void fail(GenerationTask task, String message) {
    listings.failGeneration(task.listingId(), task.startedAt(), message,
        ListingRepository.GENERATION_TIMEOUT);
  }

  @Transactional(readOnly = true)
  public GenerationValidation.Report validate(AppUser user, UUID id, int expectedVersion) {
    Listing listing = requireEditable(user, id, expectedVersion);
    return GenerationValidation.validate(listing, photos.findByListingIdOrderByIdAsc(id));
  }

  private Listing requireEditable(AppUser user, UUID id, int expectedVersion) {
    Listing listing = listings.findByIdAndUserId(id, user.getId())
        .orElseThrow(() -> new ApiProblem(404, "NOT_FOUND", "Объявление не найдено."));
    if (listing.getStatus() == ListingStatus.generating) {
      throw new ApiProblem(409, "LISTING_BUSY",
          "Идёт генерация. Дождитесь её завершения.", List.of(), listing.getVersion());
    }
    if (listing.getVersion() != expectedVersion) {
      throw new ApiProblem(409, "VERSION_CONFLICT",
          "Объявление изменилось. Загрузите текущую версию.", List.of(), listing.getVersion());
    }
    return listing;
  }

  private List<Channel> selectChannels(List<UUID> requested) {
    if (requested == null || requested.isEmpty()) {
      throw new ApiProblem(422, "VALIDATION_FAILED", "Выберите площадки для генерации.",
          List.of(new FieldIssue("REQUIRED", "/channelIds", "Выберите хотя бы одну площадку")));
    }
    List<Channel> active = channels.findByIsActiveTrueOrderByName();
    Map<UUID, Channel> byId = new LinkedHashMap<>();
    active.forEach(channel -> byId.put(channel.getId(), channel));
    List<Channel> selected = new ArrayList<>();
    List<FieldIssue> issues = new ArrayList<>();
    var seen = new HashSet<UUID>();
    for (UUID id : requested) {
      Channel channel = byId.get(id);
      if (channel == null) {
        issues.add(new FieldIssue("INVALID", "/channelIds",
            "Площадка недоступна: " + id));
      } else if (!seen.add(id)) {
        issues.add(new FieldIssue("DUPLICATE", "/channelIds", "Площадка выбрана повторно: " + id));
      } else {
        selected.add(channel);
      }
    }
    if (!issues.isEmpty()) {
      throw new ApiProblem(422, "VALIDATION_FAILED",
          "Проверьте выбранные площадки.", issues);
    }
    return selected;
  }

  /** Исходные данные фиксируются на момент запуска; версии площадок неизменяемы. */
  private GenerationTask snapshot(Listing listing, List<Photo> listingPhotos,
      List<Channel> selected, OffsetDateTime startedAt) {
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
    List<PhotoAiInput> photoInputs = listingPhotos.stream()
        .map(photo -> new PhotoAiInput(photo.getId().toString(), describe(photo)))
        .toList();
    AdGenerationRequest request = new AdGenerationRequest(
        listing.getData(), photoInputs, channelInputs, null);
    return new GenerationTask(listing.getId(), startedAt, request, snapshots);
  }

  private String describe(Photo photo) {
    String scene = photo.getScene() == null ? "" : photo.getScene().trim();
    String reason = photo.getQualityReason() == null ? "" : photo.getQualityReason().trim();
    return scene.isEmpty() ? reason : (reason.isEmpty() ? scene : scene + ". " + reason);
  }

  private record GenerationTask(UUID listingId, OffsetDateTime startedAt, AdGenerationRequest request,
      Map<String, StoredResultMapper.ChannelSnapshot> channels) {
  }
}
