package com.adtune.backend.listing;

import com.adtune.backend.db.Listing;
import com.adtune.backend.db.ListingStatus;
import com.adtune.backend.photo.PhotoView;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Представление объявления для фронтенда (см. parseListing/parseSummary в
 * frontend/src/shared/api/listings.ts): поля сводки извлекаются из data,
 * ошибки генерации отдаются в problem-формате, фотографии появятся в П6.
 */
public record ListingView(
    String id,
    Integer version,
    String status,
    String address,
    String dealType,
    String objectType,
    Long price,
    Boolean hasResult,
    Boolean isApartments,
    JsonNode data,
    JsonNode result,
    Map<String, Object> generationError,
    List<?> photos,
    String createdAt,
    String updatedAt) {

  public static ListingView of(Listing listing, List<PhotoView> photos) {
    ListingView view = ofFields(listing.getId(), listing.getVersion(), listing.getStatus(),
        listing.getData(), listing.getResult(), listing.getGenerationError(),
        listing.getCreatedAt(), listing.getUpdatedAt());
    return new ListingView(view.id, view.version, view.status, view.address, view.dealType,
        view.objectType, view.price, view.hasResult, view.isApartments, view.data, view.result,
        view.generationError, photos, view.createdAt, view.updatedAt);
  }

  /** Маппинг полей строки SQL без загрузки сущности (страница списка). */
  public static ListingView ofFields(UUID id, int version, ListingStatus status, JsonNode data,
      JsonNode result, String generationError, OffsetDateTime createdAt, OffsetDateTime updatedAt) {
    return new ListingView(
        id.toString(),
        version,
        status.name(),
        textOrNull(data.path("location").path("address")),
        textOrNull(data.path("deal").path("type")),
        textOrNull(data.path("object").path("type")),
        priceOrNull(data.path("deal").path("price")),
        result != null,
        data.path("object").path("type").asText("").equals("flat")
            && data.path("object").path("isApartments").asBoolean(false),
        data,
        result,
        generationError != null && status == ListingStatus.failed
            ? Map.of("type", "about:blank", "title", generationError, "status", 502,
                "code", "GENERATION_FAILED", "requestId", UUID.randomUUID().toString())
            : null,
        List.of(),
        createdAt.toString(),
        updatedAt.toString());
  }

  private static String textOrNull(JsonNode node) {
    return node.isTextual() && !node.asText().isBlank() ? node.asText() : null;
  }

  private static Long priceOrNull(JsonNode node) {
    return node.isNumber() && node.canConvertToLong() ? node.longValue() : null;
  }
}
