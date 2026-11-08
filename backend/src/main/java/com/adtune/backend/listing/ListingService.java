package com.adtune.backend.listing;

import com.adtune.backend.db.AppUser;
import com.adtune.backend.db.Listing;
import com.adtune.backend.db.ListingRepository;
import com.adtune.backend.db.ListingStatus;
import com.adtune.backend.web.ApiProblem;
import com.adtune.backend.web.FieldIssue;
import com.fasterxml.jackson.databind.JsonNode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Объявления агента: черновики, список с поиском по адресу и фильтром по дате,
 * редактирование с оптимистичной версией. Формат data задаёт фронт,
 * бэкенд хранит и передаёт его целиком (см. infra/README.md).
 */
@Service
public class ListingService {

  private static final Pattern ISO_DATE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");
  private static final int MAX_LIMIT = 50;

  private final ListingRepository listings;
  private final com.adtune.backend.photo.PhotoService photoService;
  private final JdbcTemplate jdbc;
  private final com.fasterxml.jackson.databind.ObjectMapper mapper
      = new com.fasterxml.jackson.databind.ObjectMapper();

  public ListingService(ListingRepository listings,
      com.adtune.backend.photo.PhotoService photoService, JdbcTemplate jdbc) {
    this.listings = listings;
    this.photoService = photoService;
    this.jdbc = jdbc;
  }

  public record ListingPage(List<ListingView> items, String nextCursor) {
  }

  @Transactional
  public ListingView create(AppUser user, JsonNode data) {
    requireObject(data);
    Listing saved = listings.save(Listing.newDraft(user.getId(), data));
    return ListingView.of(saved, photoService.viewsOf(saved.getId()));
  }

  @Transactional(readOnly = true)
  public ListingView get(AppUser user, UUID id) {
    Listing listing = loadOwned(user, id);
    return ListingView.of(listing, photoService.viewsOf(listing.getId()));
  }

  /** Пагинация по updated_at: курсор — смещение; q ищет по адресу, from/to — по дате создания. */
  @Transactional(readOnly = true)
  public ListingPage page(AppUser user, String cursor, Integer limit, String q,
      String from, String to) {
    int offset = 0;
    if (cursor != null && !cursor.isBlank()) {
      try {
        offset = Math.max(0, Integer.parseInt(cursor));
      } catch (NumberFormatException e) {
        throw new ApiProblem(400, "INVALID_CURSOR", "Некорректный курсор страницы.");
      }
    }
    int pageSize = limit == null ? 20 : Math.min(Math.max(limit, 1), MAX_LIMIT);

    List<Object> args = new ArrayList<>();
    StringBuilder where = new StringBuilder(" WHERE user_id = ?");
    args.add(user.getId());
    if (q != null && !q.isBlank()) {
      where.append(" AND data->'location'->>'address' ILIKE ?");
      args.add("%" + q.trim() + "%");
    }
    LocalDate fromDate = dateFilter(from, "/from");
    LocalDate toDate = dateFilter(to, "/to");
    if (fromDate != null) {
      where.append(" AND created_at >= CAST(? AS timestamptz)");
      args.add(fromDate.atStartOfDay(java.time.ZoneOffset.UTC).toString());
    }
    if (toDate != null) {
      where.append(" AND created_at < CAST(? AS timestamptz)");
      args.add(toDate.plusDays(1).atStartOfDay(java.time.ZoneOffset.UTC).toString());
    }

    List<ListingView> items = jdbc.query(
        "SELECT * FROM listing" + where
            + " ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?",
        rowMapper(),
        concat(args, pageSize, offset));
    boolean hasMore = items.size() > pageSize;
    List<ListingView> page = hasMore ? items.subList(0, pageSize) : items;
    String nextCursor = hasMore ? String.valueOf(offset + pageSize) : null;
    return new ListingPage(page, nextCursor);
  }

  @Transactional
  public ListingView update(AppUser user, UUID id, JsonNode data, int expectedVersion) {
    requireObject(data);
    Listing current = loadOwned(user, id);
    checkEditable(current, expectedVersion);
    int rows = listings.updateData(id, user.getId(), expectedVersion, data.toString(),
        OffsetDateTime.now());
    if (rows == 0) {
      // Гонка: кто-то изменил объявление между чтением и записью — разберёмся по свежим данным.
      checkEditable(loadOwned(user, id), expectedVersion);
      throw new IllegalStateException("Обновление не прошло при совпадающей версии");
    }
    return ListingView.of(loadOwned(user, id), photoService.viewsOf(id));
  }

  @Transactional
  public void delete(AppUser user, UUID id, int expectedVersion) {
    loadOwned(user, id);
    int rows = listings.deleteByIdAndUserIdAndVersion(id, user.getId(), expectedVersion);
    if (rows == 0) {
      checkEditable(loadOwned(user, id), expectedVersion);
      throw new IllegalStateException("Удаление не прошло при совпадающей версии");
    }
  }

  private Listing loadOwned(AppUser user, UUID id) {
    return listings.findByIdAndUserId(id, user.getId())
        .orElseThrow(() -> new ApiProblem(404, "NOT_FOUND", "Объявление не найдено."));
  }

  private void checkEditable(Listing listing, int expectedVersion) {
    if (listing.getStatus() == ListingStatus.generating) {
      throw new ApiProblem(409, "LISTING_BUSY",
          "Идёт генерация. Дождитесь её завершения.", List.of(), listing.getVersion());
    }
    if (listing.getVersion() != expectedVersion) {
      throw new ApiProblem(409, "VERSION_CONFLICT",
          "Объявление изменилось. Загрузите текущую версию.", List.of(), listing.getVersion());
    }
  }

  private void requireObject(JsonNode data) {
    if (data == null || !data.isObject()) {
      throw ApiProblem.validation(List.of(new FieldIssue("INVALID", "/data",
          "Данные объявления должны быть JSON-объектом")));
    }
  }

  private LocalDate dateFilter(String value, String field) {
    if (value == null || value.isBlank()) {
      return null;
    }
    if (!ISO_DATE.matcher(value).matches()) {
      throw ApiProblem.validation(List.of(new FieldIssue("INVALID", field,
          "Дата должна быть в формате ГГГГ-ММ-ДД")));
    }
    return LocalDate.parse(value);
  }

  private static Object[] concat(List<Object> args, int limit, int offset) {
    Object[] all = new Object[args.size() + 2];
    for (int i = 0; i < args.size(); i++) {
      all[i] = args.get(i);
    }
    all[args.size()] = limit;
    all[args.size() + 1] = offset;
    return all;
  }

  private RowMapper<ListingView> rowMapper() {
    return (rs, rowNum) -> ListingView.ofFields(
        UUID.fromString(rs.getString("id")),
        rs.getInt("version"),
        ListingStatus.valueOf(rs.getString("status")),
        readJson(rs.getString("data")),
        readJson(rs.getString("result")),
        rs.getString("generation_error"),
        rs.getObject("created_at", OffsetDateTime.class),
        rs.getObject("updated_at", OffsetDateTime.class));
  }

  private JsonNode readJson(String value) throws SQLException {
    if (value == null) {
      return null;
    }
    try {
      return mapper.readTree(value);
    } catch (Exception e) {
      throw new SQLException("Нечитаемый jsonb в listing", e);
    }
  }
}
