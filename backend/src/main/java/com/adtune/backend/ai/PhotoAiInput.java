package com.adtune.backend.ai;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Фотография, доступная модели: идентификатор и результат её AI-анализа.
 *
 * @param photoId     идентификатор фотографии в системе
 * @param description что на фото, например «Гостиная»
 */
public record PhotoAiInput(
    @JsonProperty("photo_id") String photoId,
    String description) {
}
