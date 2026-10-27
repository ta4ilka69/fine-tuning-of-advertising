package com.adtune.backend.ai;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/**
 * Результат генерации — то, что показывается на экране «Результат генерации»
 * и хранится в {@code listing.result}. Имена полей на JSON-представлении
 * соответствуют модели данных проекта (snake_case).
 *
 * @param score        общая оценка привлекательности 0–100
 * @param why          причины оценки: плюс/минус и текст; всего не менее трёх
 * @param howToImprove рекомендации, как повысить оценку
 * @param channels     результаты по каждой выбранной площадке
 */
public record AdGenerationResult(
    int score,
    List<Reason> why,
    @JsonProperty("how_to_improve") List<String> howToImprove,
    List<ChannelOutcome> channels) {

  public AdGenerationResult {
    why = why == null ? List.of() : List.copyOf(why);
    howToImprove = howToImprove == null ? List.of() : List.copyOf(howToImprove);
    channels = channels == null ? List.of() : List.copyOf(channels);
  }

  /** Одна причина оценки: сильная (plus) или слабая сторона объявления. */
  public record Reason(boolean plus, String text) {
  }

  /**
   * Материалы для одной площадки.
   *
   * @param channelId площадка, к которой относится результат
   * @param titles    варианты заголовка
   * @param text      текст объявления
   * @param checklist отметки чек-листа по правилам площадки, в том же порядке
   * @param photos    рекомендованный порядок фотографий
   */
  public record ChannelOutcome(
      @JsonProperty("channel_id") String channelId,
      List<String> titles,
      String text,
      List<Boolean> checklist,
      PhotoPlan photos) {

    public ChannelOutcome {
      titles = titles == null ? List.of() : List.copyOf(titles);
      checklist = checklist == null ? List.of() : List.copyOf(checklist);
    }
  }

  /**
   * Порядок фотографий: первые позиции, остальные и исключённые.
   * Идентификаторы — только из числа переданных в запросе.
   */
  public record PhotoPlan(
      List<TopPhoto> top,
      List<String> rest,
      List<String> excluded) {

    public PhotoPlan {
      top = top == null ? List.of() : List.copyOf(top);
      rest = rest == null ? List.of() : List.copyOf(rest);
      excluded = excluded == null ? List.of() : List.copyOf(excluded);
    }
  }

  /** Фотография на первой позиции с объяснением выбора. */
  public record TopPhoto(
      @JsonProperty("photo_id") String photoId,
      String why) {
  }
}
