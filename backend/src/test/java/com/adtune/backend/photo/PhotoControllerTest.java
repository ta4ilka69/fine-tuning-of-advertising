package com.adtune.backend.photo;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.adtune.backend.auth.AuthService;
import com.adtune.backend.db.AppUser;
import com.adtune.backend.db.Photo;
import com.adtune.backend.web.ApiProblem;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.multipart.MultipartFile;

/** Контракт фото-ручек: форма загрузки, статусы и коды ошибок из фронтенда. */
@WebMvcTest(controllers = PhotoController.class)
class PhotoControllerTest {

  @Autowired
  private MockMvc mockMvc;

  @MockitoBean
  private PhotoService service;

  @MockitoBean
  private AuthService authService;

  private UUID listingId;
  private UUID photoId;

  @BeforeEach
  void setUp() {
    when(authService.resolve(any()))
        .thenReturn(java.util.Optional.of(AppUser.register("tester", "hash")));
    listingId = UUID.randomUUID();
    photoId = UUID.randomUUID();
  }

  private Photo photo() {
    Photo photo = Photo.uploaded(listingId, "orig/x.jpg", "flat.jpg", "image/jpeg", 1024);
    photo.attachThumbnail("thumb/x.jpg");
    return photo;
  }

  @Test
  void uploadReturns201WithVersionAndPhoto() throws Exception {
    when(service.upload(any(), eq(listingId), any(), eq(1)))
        .thenReturn(new PhotoService.MutationResult(2, PhotoView.of(photo())));

    mockMvc.perform(multipart("/v1/listings/{id}/photos", listingId)
            .file(new MockMultipartFile("file", "flat.jpg", "image/jpeg", new byte[] {1, 2, 3}))
            .param("expectedVersion", "1"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.version").value(2))
        .andExpect(jsonPath("$.photo.id").isNotEmpty())
        .andExpect(jsonPath("$.photo.status").value("processing"))
        .andExpect(jsonPath("$.photo.mimeType").value("image/jpeg"))
        .andExpect(jsonPath("$.photo.sizeBytes").value(1024))
        .andExpect(jsonPath("$.photo.contentUrl",
            org.hamcrest.Matchers.startsWith("/api/v1/listings/" + listingId + "/photos/")))
        .andExpect(jsonPath("$.photo.thumbnailUrl",
            org.hamcrest.Matchers.endsWith("/thumbnail")));
  }

  @Test
  void uploadRejectsOversizedFileWith413() throws Exception {
    when(service.upload(any(), eq(listingId), any(), eq(1)))
        .thenThrow(new ApiProblem(413, "FILE_TOO_LARGE", "Файл слишком большой. Выберите файл до 15 МБ."));

    mockMvc.perform(multipart("/v1/listings/{id}/photos", listingId)
            .file(new MockMultipartFile("file", "big.jpg", "image/jpeg", new byte[] {1}))
            .param("expectedVersion", "1"))
        .andExpect(status().isPayloadTooLarge())
        .andExpect(jsonPath("$.code").value("FILE_TOO_LARGE"));
  }

  @Test
  void uploadRejectsUnknownFormatWith415() throws Exception {
    when(service.upload(any(), eq(listingId), any(), eq(1)))
        .thenThrow(new ApiProblem(415, "INVALID_FILE_TYPE", "Сервер не распознал JPEG или PNG."));

    mockMvc.perform(multipart("/v1/listings/{id}/photos", listingId)
            .file(new MockMultipartFile("file", "doc.pdf", "application/pdf", new byte[] {1}))
            .param("expectedVersion", "1"))
        .andExpect(status().isUnsupportedMediaType());
  }

  @Test
  void uploadRejectsTwentiethPhotoWith422() throws Exception {
    when(service.upload(any(), eq(listingId), any(), eq(1)))
        .thenThrow(new ApiProblem(422, "PHOTO_LIMIT_EXCEEDED", "Лимит 20 фото."));

    mockMvc.perform(multipart("/v1/listings/{id}/photos", listingId)
            .file(new MockMultipartFile("file", "21.jpg", "image/jpeg", new byte[] {1}))
            .param("expectedVersion", "1"))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void foreignListingIs403() throws Exception {
    when(service.upload(any(), eq(listingId), any(), eq(1)))
        .thenThrow(new ApiProblem(403, "FORBIDDEN", "Нет доступа к этому объявлению."));

    mockMvc.perform(multipart("/v1/listings/{id}/photos", listingId)
            .file(new MockMultipartFile("file", "flat.jpg", "image/jpeg", new byte[] {1}))
            .param("expectedVersion", "1"))
        .andExpect(status().isForbidden());
  }

  @Test
  void removeReturnsNewVersion() throws Exception {
    when(service.remove(any(), eq(listingId), eq(photoId), eq(3))).thenReturn(4);

    mockMvc.perform(delete("/v1/listings/{lid}/photos/{pid}", listingId, photoId)
            .param("expectedVersion", "3"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.version").value(4));
  }

  @Test
  void busyListingRejectsUpload() throws Exception {
    when(service.upload(any(), eq(listingId), any(), eq(2)))
        .thenThrow(new ApiProblem(409, "LISTING_BUSY", "Идёт генерация.", List.of(), 2));

    mockMvc.perform(multipart("/v1/listings/{id}/photos", listingId)
            .file(new MockMultipartFile("file", "flat.jpg", "image/jpeg", new byte[] {1}))
            .param("expectedVersion", "2"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("LISTING_BUSY"));
  }
}
