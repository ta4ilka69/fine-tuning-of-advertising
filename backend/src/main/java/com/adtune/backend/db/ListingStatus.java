package com.adtune.backend.db;

/**
 * Состояние объявления. Переходы (см. infra/README.md):
 * draft → generating → ready | failed; правка данных возвращает в draft.
 */
public enum ListingStatus {
  draft, generating, ready, failed
}
