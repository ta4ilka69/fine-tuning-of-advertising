package com.adtune.backend.photo;

import com.adtune.backend.db.AppUser;
import com.adtune.backend.db.Listing;
import com.adtune.backend.db.ListingRepository;
import com.adtune.backend.db.ListingStatus;
import com.adtune.backend.db.Photo;
import com.adtune.backend.db.PhotoRepository;
import com.adtune.backend.web.ApiProblem;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Фотографии объявления: загрузка с мгновенным превью, удаление, выдача
 * контента. Оценку нейросеть проставит позже (статус processing до анализа),
 * лимиты и коды ошибок зафиксированы фронтендом (features/listing-photos).
 */
@Service
public class PhotoService {

  private static final Logger log = LoggerFactory.getLogger(PhotoService.class);

  /** Лимиты из требований: до 20 фото, до 15 МБ, JPG/PNG. */
  static final int MAX_PHOTOS = 20;
  static final int MAX_SIZE_BYTES = 15_000_000;

  private final PhotoRepository photos;
  private final ListingRepository listings;
  private final PhotoStorage storage;
  private final ThumbnailGenerator thumbnails;

  public PhotoService(PhotoRepository photos, ListingRepository listings,
      PhotoStorage storage, ThumbnailGenerator thumbnails) {
    this.photos = photos;
    this.listings = listings;
    this.storage = storage;
    this.thumbnails = thumbnails;
  }

  public record MutationResult(int version, PhotoView photo) {
  }

  public record StoredFile(byte[] content, String fileName) {

    public String mimeType() {
      return looksLikePng(content) ? "image/png" : "image/jpeg";
    }
  }

  @Transactional
  public MutationResult upload(AppUser user, UUID listingId, StoredFile file,
      int expectedVersion) {
    Listing listing = ownedListing(user, listingId);
    checkEditable(listing, expectedVersion);

    if (file.content().length > MAX_SIZE_BYTES || file.content().length == 0) {
      throw new ApiProblem(413, "FILE_TOO_LARGE",
          "Файл слишком большой. Выберите файл до 15 МБ.");
    }
    if (!looksLikeJpeg(file.content()) && !looksLikePng(file.content())) {
      throw new ApiProblem(415, "INVALID_FILE_TYPE",
          "Сервер не распознал JPEG или PNG. Выберите другой файл.");
    }
    if (photos.countByListingId(listingId) >= MAX_PHOTOS) {
      throw new ApiProblem(422, "PHOTO_LIMIT_EXCEEDED",
          "Сервер не смог принять фотографию. Проверьте файл и лимит 20 фото.");
    }
    String fileName = file.fileName() == null || file.fileName().isBlank()
        ? "photo" : file.fileName();

    String extension = looksLikePng(file.content()) ? "png" : "jpg";
    Photo photo = Photo.uploaded(listingId,
        "orig/" + UUID.randomUUID() + "." + extension,
        fileName, file.mimeType(), file.content().length);
    byte[] thumb = thumbnails.thumbnail(file.content());
    photo.attachThumbnail("thumb/" + photo.getId() + ".jpg");
    storage.store(photo.getS3Key(), file.content());
    storage.store(photo.getThumbnailS3Key(), thumb);
    Photo saved = photos.save(photo);

    int newVersion = bumpVersion(listingId, user.getId(), expectedVersion);
    log.info("Фото {} загружено к объявлению {} ({} байт, версия {})",
        saved.getId(), listingId, file.content().length, newVersion);
    return new MutationResult(newVersion, PhotoView.of(saved));
  }

  @Transactional
  public int remove(AppUser user, UUID listingId, UUID photoId, int expectedVersion) {
    Listing listing = ownedListing(user, listingId);
    checkEditable(listing, expectedVersion);
    Photo photo = photos.findByIdAndListingId(photoId, listingId)
        .orElseThrow(() -> new ApiProblem(404, "NOT_FOUND",
            "Объявление не найдено или фотография больше недоступна."));
    // Строку удаляем здесь, файлы — фоновая задача по file_cleanup (триггер схемы).
    photos.delete(photo);
    return bumpVersion(listingId, user.getId(), expectedVersion);
  }

  /** Байты файла для выдачи: контент — с исходным типом, превью — JPEG. */
  public record FileContent(byte[] bytes, String mimeType) {
  }

  @Transactional(readOnly = true)
  public FileContent content(AppUser user, UUID listingId, UUID photoId, boolean thumbnail) {
    Photo photo = photos.findByIdAndListingId(photoId, listingId)
        .orElseThrow(() -> new ApiProblem(404, "NOT_FOUND",
            "Объявление не найдено или фотография больше недоступна."));
    requireAccess(user, photo.getListingId());
    String key = thumbnail ? photo.getThumbnailS3Key() : photo.getS3Key();
    if (key == null) {
      throw new ApiProblem(404, "NOT_FOUND", "Превью ещё не готово.");
    }
    try {
      String mimeType = thumbnail ? "image/jpeg" : photo.getMimeType();
      return new FileContent(storage.load(key), mimeType);
    } catch (UncheckedIOException e) {
      log.error("Файл {} недоступен в хранилище", key, e);
      throw new ApiProblem(404, "NOT_FOUND",
          "Объявление не найдено или фотография больше недоступна.");
    }
  }

  public List<PhotoView> viewsOf(UUID listingId) {
    return photos.findByListingIdOrderByIdAsc(listingId).stream().map(PhotoView::of).toList();
  }

  private Listing ownedListing(AppUser user, UUID listingId) {
    Listing listing = listings.findById(listingId).orElse(null);
    if (listing == null) {
      throw new ApiProblem(404, "NOT_FOUND", "Объявление не найдено.");
    }
    requireAccess(user, listing.getId());
    return listing;
  }

  /** Фото чужого объявления — 403 (не раскрывать наличие 404'ом здесь не нужно). */
  private void requireAccess(AppUser user, UUID listingId) {
    if (listings.findByIdAndUserId(listingId, user.getId()).isEmpty()) {
      throw new ApiProblem(403, "FORBIDDEN", "Нет доступа к этому объявлению.");
    }
  }

  private void checkEditable(Listing listing, int expectedVersion) {
    if (listing.getStatus() == ListingStatus.generating) {
      throw new ApiProblem(409, "LISTING_BUSY",
          "Идёт генерация. Дождитесь её завершения.", List.of(), listing.getVersion());
    }
    if (listing.getVersion() != expectedVersion) {
      throw new ApiProblem(409, "VERSION_CONFLICT",
          "Объявление изменилось. Загрузите текущую версию.", List.of(), listing.getVersion());
    }
  }

  private int bumpVersion(UUID listingId, UUID userId, int expectedVersion) {
    int rows = listings.bumpVersion(listingId, userId, expectedVersion, OffsetDateTime.now());
    if (rows == 0) {
      Listing fresh = listings.findById(listingId).orElse(null);
      if (fresh == null) {
        throw new ApiProblem(404, "NOT_FOUND", "Объявление не найдено.");
      }
      checkEditable(fresh, expectedVersion);
      throw new IllegalStateException("Не удалось обновить версию объявления");
    }
    return expectedVersion + 1;
  }

  static boolean looksLikeJpeg(byte[] bytes) {
    return bytes.length > 3 && (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8
        && (bytes[2] & 0xFF) == 0xFF;
  }

  static boolean looksLikePng(byte[] bytes) {
    return bytes.length > 8 && (bytes[0] & 0xFF) == 0x89 && bytes[1] == 0x50
        && bytes[2] == 0x4E && bytes[3] == 0x47;
  }
}
