package com.adtune.backend.web;

/** Ошибка одного поля формы; field — JSON Pointer, начинается с «/». */
public record FieldIssue(String code, String field, String message) {
}
