package com.adtune.backend.generation;

import com.adtune.backend.db.Listing;
import com.adtune.backend.db.Photo;
import com.adtune.backend.db.PhotoStatus;
import com.adtune.backend.web.FieldIssue;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

public final class GenerationValidation {

  private static final long MAX_SAFE_INTEGER = 9_007_199_254_740_991L;

  private GenerationValidation() {
  }

  public record Report(int version, boolean canGenerate, List<FieldIssue> errors,
      List<FieldIssue> warnings) {
  }

  static Report validate(Listing listing, List<Photo> photos) {
    JsonNode data = listing.getData();
    JsonNode deal = data.path("deal");
    JsonNode object = data.path("object");
    String dealType = deal.path("type").asText("");
    String objectType = object.path("type").asText("");
    JsonNode address = data.path("location").path("address");
    JsonNode totalArea = object.path("totalArea");
    List<FieldIssue> errors = new ArrayList<>();
    List<FieldIssue> warnings = new ArrayList<>();

    require(errors, Set.of("sale", "rent", "daily_rent").contains(dealType),
        "/deal/type", "Выберите тип сделки");
    require(errors, integerInRange(deal.path("price"), 1, MAX_SAFE_INTEGER),
        "/deal/price", "Укажите цену в целых рублях");
    require(errors, Set.of("flat", "room", "house").contains(objectType),
        "/object/type", "Выберите тип объекта");
    require(errors, totalArea.isNumber() && totalArea.asDouble() > 0
            && totalArea.asDouble() <= MAX_SAFE_INTEGER,
        "/object/totalArea", "Укажите общую площадь");
    require(errors, address.isTextual() && !address.asText().isBlank(),
        "/location/address", "Укажите адрес объекта");
    if ("flat".equals(objectType)) {
      require(errors, integerInRange(object.path("roomsCount"), 0, MAX_SAFE_INTEGER),
          "/object/roomsCount", "Укажите число комнат");
    }
    if ("rent".equals(dealType)) {
      require(errors, integerInRange(deal.path("deposit"), 0, MAX_SAFE_INTEGER),
          "/deal/deposit", "Укажите залог");
      require(errors, integerInRange(deal.path("commissionPercent"), 0, 100),
          "/deal/commissionPercent", "Укажите комиссию от 0 до 100%");
    }
    if (photos.isEmpty()) {
      errors.add(new FieldIssue("REQUIRED", "/photos", "Добавьте хотя бы одну фотографию"));
    } else if (photos.stream().anyMatch(photo -> photo.getStatus() != PhotoStatus.ready)) {
      errors.add(new FieldIssue("NOT_READY", "/photos",
          "Дождитесь обработки фотографий или удалите сбойные"));
    }
    warnIfGreater(warnings, object.path("floor"), data.path("building").path("floorsCount"),
        "/object/floor", "Этаж выше этажности дома");
    warnIfGreater(warnings, object.path("livingArea"), totalArea,
        "/object/livingArea", "Жилая площадь больше общей");
    warnIfGreater(warnings, object.path("kitchenArea"), totalArea,
        "/object/kitchenArea", "Площадь кухни больше общей");
    return new Report(listing.getVersion(), errors.isEmpty(), List.copyOf(errors),
        List.copyOf(warnings));
  }

  private static boolean integerInRange(JsonNode value, long min, long max) {
    return value.isIntegralNumber() && value.canConvertToLong()
        && value.asLong() >= min && value.asLong() <= max;
  }

  private static void require(List<FieldIssue> errors, boolean valid, String field,
      String message) {
    if (!valid) {
      errors.add(new FieldIssue("REQUIRED", field, message));
    }
  }

  private static void warnIfGreater(List<FieldIssue> warnings, JsonNode value,
      JsonNode maximum, String field, String message) {
    if (value.isNumber() && maximum.isNumber() && value.asDouble() > maximum.asDouble()) {
      warnings.add(new FieldIssue("INCONSISTENT", field, message));
    }
  }
}
