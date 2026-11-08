package com.adtune.backend.listing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * Полный сценарий объявлений против реальной базы: создание, список с фильтрами
 * и курсором, редактирование с оптимистичной версией, изоляция пользователей,
 * удаление. Включается переменной DB_TEST_URL, в CI пропускается.
 */
@SpringBootTest(properties = "spring.datasource.url=${DB_TEST_URL}")
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DB_TEST_URL", matches = ".+")
@Transactional
class ListingFlowIntegrationTest {

  @Autowired
  private MockMvc mockMvc;

  private static final String DATA_MOSCOW =
      "{\"deal\":{\"type\":\"sale\",\"price\":14500000},"
          + "\"object\":{\"type\":\"flat\"},"
          + "\"location\":{\"address\":\"г. Москва, ул. Примерная, 12\"}}";
  private static final String DATA_SOCHI =
      "{\"deal\":{\"type\":\"rent\"},\"object\":{\"type\":\"house\"},"
          + "\"location\":{\"address\":\"г. Сочи, ул. Приморская, 3\"}}";

  @Test
  void fullListingLifecycle() throws Exception {
    String cookie = register("listing.owner");

    // Создание черновика.
    MvcResult created = mockMvc.perform(post("/v1/listings")
            .cookie(new Cookie("session", cookie))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"data\":" + DATA_MOSCOW + "}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.version").value(1))
        .andExpect(jsonPath("$.status").value("draft"))
        .andExpect(jsonPath("$.address").value("г. Москва, ул. Примерная, 12"))
        .andExpect(jsonPath("$.price").value(14500000))
        .andExpect(jsonPath("$.isApartments").value(false))
        .andReturn();
    String id = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
        .readTree(created.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8))
        .path("id").asText();

    // Второе объявление с другим адресом.
    mockMvc.perform(post("/v1/listings")
            .cookie(new Cookie("session", cookie))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"data\":" + DATA_SOCHI + "}"))
        .andExpect(status().isCreated());

    // Список: оба своих, поиск по адресу сужает.
    mockMvc.perform(get("/v1/listings").cookie(new Cookie("session", cookie)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items.length()").value(2))
        .andExpect(jsonPath("$.nextCursor").doesNotExist());
    mockMvc.perform(get("/v1/listings")
            .cookie(new Cookie("session", cookie)).param("q", "СОЧИ"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items.length()").value(1))
        .andExpect(jsonPath("$.items[0].objectType").value("house"));
    mockMvc.perform(get("/v1/listings")
            .cookie(new Cookie("session", cookie))
            .param("from", "2100-01-01"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items.length()").value(0));

    // Просмотр.
    mockMvc.perform(get("/v1/listings/{id}", id).cookie(new Cookie("session", cookie)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value(id));

    // Чужое объявление не видно (404, а не 403 — не раскрываем существование).
    String stranger = register("listing.stranger");
    mockMvc.perform(get("/v1/listings/{id}", id).cookie(new Cookie("session", stranger)))
        .andExpect(status().isNotFound());

    // Редактирование с устаревшей версией.
    mockMvc.perform(put("/v1/listings/{id}", id)
            .cookie(new Cookie("session", cookie))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"data\":" + DATA_SOCHI + ",\"expectedVersion\":99}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"))
        .andExpect(jsonPath("$.currentVersion").value(1));

    // Корректное редактирование: версия растёт, статус draft, адрес меняется.
    mockMvc.perform(put("/v1/listings/{id}", id)
            .cookie(new Cookie("session", cookie))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"data\":" + DATA_SOCHI + ",\"expectedVersion\":1}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.version").value(2))
        .andExpect(jsonPath("$.address").value("г. Сочи, ул. Приморская, 3"));

    // Некорректные данные — 400 с fieldErrors по /data.
    mockMvc.perform(post("/v1/listings")
            .cookie(new Cookie("session", cookie))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"data\":42}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.fieldErrors[0].field").value("/data"));

    // Некорректный курсор и даты.
    mockMvc.perform(get("/v1/listings")
            .cookie(new Cookie("session", cookie)).param("cursor", "abc"))
        .andExpect(status().isBadRequest());
    mockMvc.perform(get("/v1/listings")
            .cookie(new Cookie("session", cookie)).param("from", "01.01.2026"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.fieldErrors[0].field").value("/from"));

    // Удаление и 404 после него.
    mockMvc.perform(delete("/v1/listings/{id}", id)
            .cookie(new Cookie("session", cookie)).param("expectedVersion", "2"))
        .andExpect(status().isNoContent());
    mockMvc.perform(get("/v1/listings/{id}", id).cookie(new Cookie("session", cookie)))
        .andExpect(status().isNotFound());

    assertThat(UUID.fromString(id)).isNotNull();
  }

  private String register(String login) throws Exception {
    MvcResult result = mockMvc.perform(post("/v1/auth/register")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"login\":\"" + login + "\",\"password\":\"long-password-12\"}"))
        .andExpect(status().isCreated())
        .andReturn();
    return result.getResponse().getHeader("Set-Cookie").split(";")[0].split("=")[1];
  }
}
