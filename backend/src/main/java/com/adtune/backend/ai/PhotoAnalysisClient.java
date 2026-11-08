package com.adtune.backend.ai;

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
   */
  record PhotoAnalysis(int quality, String qualityReason, String scene) {
  }
}
