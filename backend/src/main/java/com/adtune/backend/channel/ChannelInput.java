package com.adtune.backend.channel;

import com.adtune.backend.web.ApiProblem;
import com.adtune.backend.web.FieldIssue;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;

record ChannelInput(String name, String description, String instruction, List<String> checklist,
    boolean active, Integer titleLimit, Integer textLimit, Integer expectedNumber) {

  static ChannelInput parse(JsonNode body, boolean update) {
    List<FieldIssue> errors = new ArrayList<>();
    String name = requiredText(body.path("name"), "/name", errors);
    String instruction = requiredText(body.path("instruction"), "/instruction", errors);
    JsonNode description = body.path("description");
    if (!description.isTextual()) {
      errors.add(invalid("/description", "Укажите описание текстом."));
    }
    JsonNode active = body.path("isActive");
    if (!active.isBoolean()) {
      errors.add(invalid("/isActive", "Укажите, включена ли площадка."));
    }
    List<String> checklist = new ArrayList<>();
    JsonNode rules = body.path("checklist");
    if (!rules.isArray() || rules.isEmpty()) {
      errors.add(invalid("/checklist", "Добавьте хотя бы одно правило."));
    } else {
      for (int index = 0; index < rules.size(); index++) {
        checklist.add(requiredText(rules.get(index), "/checklist/" + index, errors));
      }
    }
    JsonNode limits = body.path("limits");
    Integer titleLimit = null;
    Integer textLimit = null;
    if (!limits.isObject()) {
      errors.add(invalid("/limits", "Укажите ограничения длины."));
    } else {
      titleLimit = positiveInteger(limits.path("titleLimit"), "/limits/titleLimit", true, errors);
      textLimit = positiveInteger(limits.path("textLimit"), "/limits/textLimit", true, errors);
    }
    Integer expectedNumber = update
        ? positiveInteger(body.path("expectedNumber"), "/expectedNumber", false, errors)
        : null;
    if (!errors.isEmpty()) {
      throw new ApiProblem(422, "VALIDATION_FAILED", "Проверьте настройки площадки.", errors);
    }
    return new ChannelInput(name, description.textValue().strip(), instruction,
        List.copyOf(checklist), active.booleanValue(), titleLimit, textLimit, expectedNumber);
  }

  private static String requiredText(JsonNode value, String path, List<FieldIssue> errors) {
    if (!value.isTextual() || value.textValue().isBlank()) {
      errors.add(invalid(path, "Введите непустой текст."));
      return "";
    }
    return value.textValue().strip();
  }

  private static Integer positiveInteger(JsonNode value, String path, boolean nullable,
      List<FieldIssue> errors) {
    if (nullable && value.isNull()) {
      return null;
    }
    if (!value.isIntegralNumber() || !value.canConvertToInt() || value.intValue() < 1) {
      errors.add(invalid(path, "Введите целое число больше нуля."));
      return null;
    }
    return value.intValue();
  }

  private static FieldIssue invalid(String path, String message) {
    return new FieldIssue("INVALID", path, message);
  }
}
