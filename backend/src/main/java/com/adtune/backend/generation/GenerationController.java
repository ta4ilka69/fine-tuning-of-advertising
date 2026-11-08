package com.adtune.backend.generation;

import com.adtune.backend.auth.CurrentUser;
import com.adtune.backend.db.AppUser;
import com.adtune.backend.listing.ListingView;
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
@RequestMapping("/v1/listings/{id}/generations")
public class GenerationController {

  private final GenerationService service;

  public GenerationController(GenerationService service) {
    this.service = service;
  }

  public record StartGeneration(Integer expectedVersion, List<UUID> channelIds) {
  }

  @PostMapping
  public ResponseEntity<ListingView> start(@CurrentUser AppUser user, @PathVariable UUID id,
      @RequestBody StartGeneration request) {
    if (request == null || request.expectedVersion() == null) {
      throw new com.adtune.backend.web.ApiProblem(400, "VALIDATION_ERROR",
          "Укажите expectedVersion.");
    }
    ListingView view = service.start(user, id, request.expectedVersion(),
        request.channelIds());
    return ResponseEntity.accepted().body(view);
  }
}
