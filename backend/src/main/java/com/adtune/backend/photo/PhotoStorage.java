package com.adtune.backend.photo;

/** Хранилище файлов фотографий; имплементация сменой бина (S3, MinIO, …). */
public interface PhotoStorage {

  /** Сохраняет файл и возвращает фактический ключ. */
  String store(String key, byte[] content);

  byte[] load(String key);

  void delete(String key);
}
