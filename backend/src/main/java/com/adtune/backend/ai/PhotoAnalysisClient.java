package com.adtune.backend.ai;

import java.util.List;

/**
 * Общий интерфейс анализа фотографии недвижимости: оценка, обоснование
 * и что изображено. Отделен от генерации объявлений — своя имплементация
 * под провайдера при необходимости.
 */
public interface PhotoAnalysisClient {

  /**
   * @param image    байты изображения
   * @param mimeType image/jpeg или image/png
   */
  PhotoAnalysis analyze(byte[] image, String mimeType);

  /**
   * @param quality       1 — не подходит, 2 — можно улучшить, 3 — хорошо
   * @param qualityReason обоснование оценки и возможные улучшения
   * @param scene         что на фото, например «Гостиная»
   * @param description   подробное описание кадра для генерации текста:
   *                      комната, состояние, свет, примечательные детали
   * @param improvements  по одному ответу на каждый тип правки из промпта
   */
  record PhotoAnalysis(int quality, String qualityReason, String scene, String description,
      List<Improvement> improvements) {

    /**
     * Ответ модели по одному типу правки.
     *
     * @param type            код типа правки (см. PhotoImprovement)
     * @param canImprove      применима ли правка к кадру
     * @param editInstruction при canImprove — инструкция для редактора, иначе null
     */
    public record Improvement(String type, boolean canImprove, String editInstruction) {
    }
  }
}
