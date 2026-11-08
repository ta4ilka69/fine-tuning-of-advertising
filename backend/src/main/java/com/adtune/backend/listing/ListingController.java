package com.adtune.backend.listing;

import com.adtune.backend.auth.CurrentUser;
import com.adtune.backend.db.AppUser;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Объявления текущего агента. Контракт: frontend/src/shared/api/listings.ts —
 * create 201, page 200 {items, nextCursor}, get/put 200, delete 204;
 * чужие объявления — 404; конфликт версий и генерация — 409 с кодами
 * VERSION_CONFLICT/LISTING_BUSY и currentVersion.
 */
@RestController
@RequestMapping("/v1/listings")
public class ListingController {

  private final ListingService service;

  public ListingController(ListingService service) {
    this.service = service;
  }

  public record CreateListing(JsonNode data) {
  }

  public record UpdateListing(JsonNode data, Integer expectedVersion) {
  }

  @PostMapping
  public ResponseEntity<ListingView> create(@CurrentUser AppUser user,
      @RequestBody CreateListing request) {
    ListingView view = service.create(user, request == null ? null : request.data());
    return ResponseEntity.status(201).body(view);
  }

  @GetMapping
  public ListingService.ListingPage page(@CurrentUser AppUser user,
      @RequestParam(required = false) String cursor,
      @RequestParam(required = false) Integer limit,
      @RequestParam(required = false) String q,
      @RequestParam(required = false) String from,
      @RequestParam(required = false) String to) {
    return service.page(user, cursor, limit, q, from, to);
  }

  @GetMapping("/{id}")
  public ListingView get(@CurrentUser AppUser user, @PathVariable UUID id) {
    return service.get(user, id);
  }

  @PutMapping("/{id}")
  public ListingView update(@CurrentUser AppUser user, @PathVariable UUID id,
      @RequestBody UpdateListing request) {
    if (request == null || request.expectedVersion() == null) {
      throw new com.adtune.backend.web.ApiProblem(400, "VALIDATION_ERROR",
          "Укажите data и expectedVersion.");
    }
    return service.update(user, id, request.data(), request.expectedVersion());
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@CurrentUser AppUser user, @PathVariable UUID id,
      @RequestParam int expectedVersion) {
    service.delete(user, id, expectedVersion);
    return ResponseEntity.noContent().build();
  }
}
