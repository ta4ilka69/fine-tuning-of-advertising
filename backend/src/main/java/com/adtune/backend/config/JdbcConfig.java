package com.adtune.backend.config;

import com.adtune.backend.db.ListingStatus;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.postgresql.util.PGobject;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.ConversionFailedException;
import org.springframework.core.convert.converter.Converter;
import org.springframework.data.convert.ReadingConverter;
import org.springframework.data.convert.WritingConverter;
import org.springframework.data.jdbc.core.convert.JdbcCustomConversions;
import org.springframework.data.relational.core.dialect.Dialect;
import org.springframework.data.relational.core.dialect.PostgresDialect;
import org.springframework.data.relational.core.mapping.NamingStrategy;
import org.springframework.data.relational.core.mapping.RelationalPersistentProperty;

/**
 * Маппинг Spring Data JDBC на схему из infra/db: имена колонок в snake_case,
 * enum-значения PostgreSQL в нижнем регистре ('agent', 'draft', …),
 * jsonb-колонки конвертируются из/в JsonNode строками (URL содержит
 * stringtype=unspecified, поэтому строки приводятся к jsonb на стороне базы).
 */
@Configuration
public class JdbcConfig {

  private static final ObjectMapper JSON = new ObjectMapper();

  @Bean
  public NamingStrategy namingStrategy() {
    return new NamingStrategy() {
      @Override
      public String getColumnName(RelationalPersistentProperty property) {
        return toSnakeCase(property.getName());
      }

      @Override
      public String getTableName(Class<?> type) {
        return toSnakeCase(type.getSimpleName());
      }
    };
  }

  /**
   * Диалект задан явно: автодетект Spring Boot подключается к базе при старте
   * контекста, а нам нужно подниматься и без доступной БД (CI, health-режим).
   */
  @Bean
  public Dialect jdbcDialect() {
    return PostgresDialect.INSTANCE;
  }

  @Bean
  public JdbcCustomConversions jdbcCustomConversions() {
    return new JdbcCustomConversions(List.of(
        new JsonNodeWriter(),
        new JsonNodeReader(),
        new PgJsonNodeReader(),
        new TimestampReader()));
  }

  @WritingConverter
  static final class JsonNodeWriter implements Converter<JsonNode, String> {
    @Override
    public String convert(JsonNode source) {
      try {
        return JSON.writeValueAsString(source);
      } catch (JsonProcessingException e) {
        throw new ConversionFailedException(null, null, source, e);
      }
    }
  }

  @ReadingConverter
  static final class JsonNodeReader implements Converter<String, JsonNode> {
    @Override
    public JsonNode convert(String source) {
      try {
        return JSON.readTree(source);
      } catch (JsonProcessingException e) {
        throw new ConversionFailedException(null, null, source, e);
      }
    }
  }

  /** Драйвер отдаёт jsonb как PGobject, а не строку — отдельный читающий конвертер. */
  @ReadingConverter
  static final class PgJsonNodeReader implements Converter<PGobject, JsonNode> {
    @Override
    public JsonNode convert(PGobject source) {
      try {
        return JSON.readTree(source.getValue());
      } catch (JsonProcessingException e) {
        throw new ConversionFailedException(null, null, source, e);
      }
    }
  }

  /** Драйвер читает timestamptz как Timestamp; сущности работают с OffsetDateTime. */
  @ReadingConverter
  static final class TimestampReader implements Converter<Timestamp, OffsetDateTime> {
    @Override
    public OffsetDateTime convert(Timestamp source) {
      return source.toInstant().atOffset(ZoneOffset.UTC);
    }
  }

  private static String toSnakeCase(String name) {
    return name.replaceAll("([a-z0-9])([A-Z])", "$1_$2").toLowerCase();
  }
}
