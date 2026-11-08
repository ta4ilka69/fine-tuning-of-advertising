package com.adtune.backend.listing;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.adtune.backend.auth.AuthService;
import com.adtune.backend.db.AppUser;
import com.adtune.backend.web.ApiProblem;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/** Контракт /v1/listings: статусы, форма ответа, коды 404/409. */
@WebMvcTest(controllers = ListingController.class)
class ListingControllerTest {

  @Autowired
  private MockMvc mockMvc;

  @MockitoBean
  private ListingService service;

  @MockitoBean
  private AuthService authService;

  private final ObjectMapper mapper = new ObjectMapper();

  @org.junit.jupiter.api.BeforeEach
  void stubCurrentUser() {
    when(authService.resolve(any())).thenReturn(java.util.Optional.of(user()));
  }

  private AppUser user() {
    return AppUser.register("tester", "hash");
  }

  @Test
  void createReturns201WithSummaryFields() throws Exception {
    String data = "{\"deal\":{\"type\":\"sale\",\"price\":14500000},"
        + "\"object\":{\"type\":\"flat\",\"isApartments\":true},"
        + "\"location\":{\"address\":\"г. Москва, ул. Примерная, 12\"}}";
    when(service.create(any(), any())).thenReturn(
        ListingView.ofFields(UUID.randomUUID(), 1,
            com.adtune.backend.db.ListingStatus.draft,
            mapper.readTree(data), null, null,
            java.time.OffsetDateTime.now(), java.time.OffsetDateTime.now()));

    mockMvc.perform(post("/v1/listings")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"data\":" + data + "}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.version").value(1))
        .andExpect(jsonPath("$.status").value("draft"))
        .andExpect(jsonPath("$.address").value("г. Москва, ул. Примерная, 12"))
        .andExpect(jsonPath("$.dealType").value("sale"))
        .andExpect(jsonPath("$.objectType").value("flat"))
        .andExpect(jsonPath("$.price").value(14500000))
        .andExpect(jsonPath("$.hasResult").value(false))
        .andExpect(jsonPath("$.isApartments").value(true))
        .andExpect(jsonPath("$.photos").isArray())
        .andExpect(jsonPath("$.generationError").doesNotExist());
  }

  @Test
  void pagePassesFiltersThrough() throws Exception {
    when(service.page(any(), eq("10"), eq(20), eq("москва"), eq("2026-01-01"), eq(null)))
        .thenReturn(new ListingService.ListingPage(List.of(), null));

    mockMvc.perform(get("/v1/listings")
            .param("cursor", "10")
            .param("limit", "20")
            .param("q", "москва")
            .param("from", "2026-01-01"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items").isArray())
        .andExpect(jsonPath("$.nextCursor").doesNotExist());
  }

  @Test
  void missingListingIs404() throws Exception {
    UUID id = UUID.randomUUID();
    when(service.get(any(), eq(id)))
        .thenThrow(new ApiProblem(404, "NOT_FOUND", "Объявление не найдено."));

    mockMvc.perform(get("/v1/listings/{id}", id))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("NOT_FOUND"));
  }

  @Test
  void versionConflictCarriesCurrentVersion() throws Exception {
    UUID id = UUID.randomUUID();
    when(service.update(any(), eq(id), any(), eq(1)))
        .thenThrow(new ApiProblem(409, "VERSION_CONFLICT",
            "Объявление изменилось. Загрузите текущую версию.", List.of(), 7));

    mockMvc.perform(put("/v1/listings/{id}", id)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"data\":{},\"expectedVersion\":1}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"))
        .andExpect(jsonPath("$.currentVersion").value(7));
  }

  @Test
  void busyListingIs409WithCode() throws Exception {
    UUID id = UUID.randomUUID();
    org.mockito.Mockito.doThrow(new ApiProblem(409, "LISTING_BUSY",
            "Идёт генерация. Дождитесь её завершения.", List.of(), 2))
        .when(service).delete(any(), eq(id), eq(2));

    mockMvc.perform(delete("/v1/listings/{id}", id).param("expectedVersion", "2"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("LISTING_BUSY"));
  }

  @Test
  void updateWithoutExpectedVersionIs400() throws Exception {
    mockMvc.perform(put("/v1/listings/{id}", UUID.randomUUID())
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"data\":{}}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
  }
}
