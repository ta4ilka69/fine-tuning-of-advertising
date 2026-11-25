package com.adtune.backend.db;

import java.util.List;

/**
 * Каталог допустимых улучшений фотографии, управляется бэкендом. Новый тип
 * правки — новая константа: промпт модели и список неизвестных ей кодов
 * собираются из каталога, а значение попадает в enum photo_improvement базы.
 * Порядок объявления констант — приоритет: если модель отметила несколько
 * типов, сохраняется первый по порядку.
 */
public enum PhotoImprovement {

  /** Лишний мусор в кадре: немытая посуда, бытовой мусор, упаковки. */
  clutter("почистить кадр", "уборка лишнего из кадра", """
      Для типа «уборка лишнего из кадра» ищи явно различимые временные предметы,
      которые загромождают кадр: бытовой мусор, пустые упаковки, смятые салфетки,
      использованную посуду. Считай правку подходящей, если предмет можно убрать
      локально и по соседним участкам понятно, как выглядит поверхность за ним.
      Сохраняй мебель, технику, декор, отделку и видимые дефекты объекта. Если
      назначение предмета неясно или он закрывает значительную часть помещения,
      исключи его из правки.
      """);

  private final String label;
  private final String editTitle;
  private final String promptRules;

  PhotoImprovement(String label, String editTitle, String promptRules) {
    this.label = label;
    this.editTitle = editTitle;
    this.promptRules = promptRules;
  }

  /** Текст для интерфейса, например «почистить кадр». */
  public String getLabel() {
    return label;
  }

  /** Название типа правки в терминах промпта модели. */
  public String getEditTitle() {
    return editTitle;
  }

  /** Правила поиска подходящих правок этого типа для промпта модели. */
  public String getPromptRules() {
    return promptRules;
  }

  /** Все типы по порядку приоритета — для промпта модели и выбора результата. */
  public static List<PhotoImprovement> ordered() {
    return List.of(values());
  }
}
