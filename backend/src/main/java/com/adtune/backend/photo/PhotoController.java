package com.adtune.backend.photo;

import com.adtune.backend.auth.CurrentUser;
import com.adtune.backend.db.AppUser;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Фотографии объявления. Форма загрузки: multipart c полями file и
 * expectedVersion (frontend/src/shared/api/photos.ts). Успех загрузки —
 * 201 {version, photo}, удаления — 200 {version}; файлы — /content и /thumbnail.
 */
@RestController
@RequestMapping("/v1/listings/{listingId}/photos")
public class PhotoController {

  private final PhotoService service;

  public PhotoController(PhotoService service) {
    this.service = service;
  }

  @PostMapping
  public ResponseEntity<PhotoService.MutationResult> upload(@CurrentUser AppUser user,
      @PathVariable UUID listingId,
      @RequestParam("file") MultipartFile file,
      @RequestParam("expectedVersion") int expectedVersion) throws Exception {
    PhotoService.StoredFile stored = new PhotoService.StoredFile(
        file.getBytes(), file.getOriginalFilename());
    PhotoService.MutationResult result = service.upload(user, listingId, stored, expectedVersion);
    return ResponseEntity.status(201).body(result);
  }

  @DeleteMapping("/{photoId}")
  public PhotoService.MutationResult remove(@CurrentUser AppUser user,
      @PathVariable UUID listingId, @PathVariable UUID photoId,
      @RequestParam int expectedVersion) {
    // Ответ — {version, photo}; photo здесь неактуален, фронт проверяет только версию.
    return new PhotoService.MutationResult(
        service.remove(user, listingId, photoId, expectedVersion), null);
  }

  @GetMapping("/{photoId}/content")
  public ResponseEntity<byte[]> content(@CurrentUser AppUser user,
      @PathVariable UUID listingId, @PathVariable UUID photoId) {
    return file(service.content(user, listingId, photoId, false));
  }

  @GetMapping("/{photoId}/thumbnail")
  public ResponseEntity<byte[]> thumbnail(@CurrentUser AppUser user,
      @PathVariable UUID listingId, @PathVariable UUID photoId) {
    return file(service.content(user, listingId, photoId, true));
  }

  private static ResponseEntity<byte[]> file(PhotoService.FileContent content) {
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType(content.mimeType()))
        .body(content.bytes());
  }
}
