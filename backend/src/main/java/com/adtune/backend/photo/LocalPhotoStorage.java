package com.adtune.backend.photo;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Локальное файловое хранилище (каталог из PHOTO_DIR; в compose — отдельный том). */
@Component
public class LocalPhotoStorage implements PhotoStorage {

  private final Path root;

  public LocalPhotoStorage(@Value("${photo.dir:photos}") String dir) {
    this.root = Path.of(dir);
    try {
      Files.createDirectories(root);
    } catch (IOException e) {
      throw new UncheckedIOException("Не удалось создать каталог хранилища " + dir, e);
    }
  }

  @Override
  public String store(String key, byte[] content) {
    Path file = root.resolve(key).normalize();
    if (!file.startsWith(root)) {
      throw new IllegalArgumentException("Недопустимый ключ файла: " + key);
    }
    try {
      Files.createDirectories(file.getParent());
      Files.write(file, content);
    } catch (IOException e) {
      throw new UncheckedIOException("Не удалось сохранить файл " + key, e);
    }
    return key;
  }

  @Override
  public byte[] load(String key) {
    try {
      return Files.readAllBytes(root.resolve(key).normalize());
    } catch (IOException e) {
      throw new UncheckedIOException("Не удалось прочитать файл " + key, e);
    }
  }

  @Override
  public void delete(String key) {
    try {
      Files.deleteIfExists(root.resolve(key).normalize());
    } catch (IOException e) {
      throw new UncheckedIOException("Не удалось удалить файл " + key, e);
    }
  }
}
