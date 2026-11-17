package com.adtune.backend.generation;

import com.adtune.backend.auth.CurrentUser;
import com.adtune.backend.config.TrustedOrigin;
import com.adtune.backend.db.AppUser;
import com.adtune.backend.listing.ListingView;
import com.adtune.backend.web.ApiProblem;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Запуск генерации. Повторный запрос при идущей генерации — 409 LISTING_BUSY,
 * новая генерация не создаётся. Статус и результат фронт смотрит в карточке
 * объявления (GET /v1/listings/{id}).
 */
@RestController
@RequestMapping("/v1/listings/{id}")
public class GenerationController {

  private final GenerationService service;
  private final TrustedOrigin origin;

  public GenerationController(GenerationService service, TrustedOrigin origin) {
    this.service = service;
    this.origin = origin;
  }

  public record StartGeneration(Integer expectedVersion, List<UUID> channelIds) {
  }

  public record ExpectedVersion(Integer expectedVersion) {
  }

  @PostMapping("/validate")
  public GenerationValidation.Report validate(@CurrentUser AppUser user, @PathVariable UUID id,
      @RequestBody ExpectedVersion request, HttpServletRequest httpRequest) {
    origin.require(httpRequest);
    return service.validate(user, id, requireVersion(request == null ? null : request.expectedVersion()));
  }

  @PostMapping("/generations")
  public ResponseEntity<ListingView> start(@CurrentUser AppUser user, @PathVariable UUID id,
      @RequestBody StartGeneration request, HttpServletRequest httpRequest) {
    origin.require(httpRequest);
    int version = requireVersion(request == null ? null : request.expectedVersion());
    ListingView view = service.start(user, id, version,
        request.channelIds());
    return ResponseEntity.accepted().body(view);
  }

  private static int requireVersion(Integer version) {
    if (version == null || version < 1) {
      throw new ApiProblem(400, "VALIDATION_ERROR", "Укажите положительный expectedVersion.");
    }
    return version;
  }
}
