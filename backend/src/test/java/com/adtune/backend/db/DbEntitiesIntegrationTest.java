package com.adtune.backend.db;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

/**
 * Проверка сущностей и репозиториев против реальной схемы из infra/db.
 * Запускается только при заданном DB_TEST_URL (см. README: поднять db в compose
 * и передать jdbc:postgresql://host.docker.internal:5544/advertising?...).
 * В CI без базы тест отключается сам.
 */
@SpringBootTest(properties = "spring.datasource.url=${DB_TEST_URL}")
@EnabledIfEnvironmentVariable(named = "DB_TEST_URL", matches = ".+")
@Transactional
class DbEntitiesIntegrationTest {

  @Autowired
  private UserRepository users;
  @Autowired
  private SessionRepository sessions;
  @Autowired
  private ChannelRepository channels;
  @Autowired
  private ChannelVersionRepository channelVersions;
  @Autowired
  private ListingRepository listings;
  @Autowired
  private PhotoRepository photos;

  private final ObjectMapper mapper = new ObjectMapper();

  @Test
  void userRoundTripWithEnumRole() {
    AppUser saved = users.save(AppUser.register("Tester.Login", "hash-value"));
    assertThat(saved.getId()).isNotNull();

    Optional<AppUser> found = users.findByLogin("tester.login");
    assertThat(found).isPresent();
    assertThat(found.orElseThrow().getRole()).isEqualTo(UserRole.agent);
    assertThat(found.orElseThrow().getPasswordHash()).isEqualTo("hash-value");
    assertThat(users.existsByLogin("TESTER.LOGIN")).isFalse();
  }

  @Test
  void sessionRoundTripByTokenHash() {
    AppUser user = users.save(AppUser.register("session.user", "hash"));
    byte[] tokenHash = new byte[32];
    new java.security.SecureRandom().nextBytes(tokenHash);

    sessions.save(Session.of(tokenHash, user.getId()));

    Optional<Session> found = sessions.findById(tokenHash);
    assertThat(found).isPresent();
    assertThat(found.orElseThrow().getUserId()).isEqualTo(user.getId());
    assertThat(found.orElseThrow().expiredAt(OffsetDateTime.now())).isFalse();

    sessions.delete(found.orElseThrow());
    assertThat(sessions.findById(tokenHash)).isEmpty();
  }

  @Test
  void channelWithVersionAndJsonChecklist() {
    ChannelVersion draft = ChannelVersion.create(null, 1,
        "Напиши объявление для теста.",
        List.of("Правило 1", "Правило 2"), 50, 7500);
    Channel channel = Channel.create("Тест-площадка", "Описание", draft.getId());
    draft.setChannelId(channel.getId());
    channels.save(channel);
    channelVersions.save(draft);

    Optional<ChannelVersion> version = channelVersions.findById(draft.getId());
    assertThat(version).isPresent();
    assertThat(version.orElseThrow().getChecklist()).containsExactly("Правило 1", "Правило 2");
    assertThat(version.orElseThrow().getTitleLimit()).isEqualTo(50);
    assertThat(version.orElseThrow().getTextLimit()).isEqualTo(7500);

    assertThat(channels.findByIsActiveTrueOrderByName())
        .extracting(Channel::getName)
        .contains("Тест-площадка", "Авито");
  }

  @Test
  void listingJsonbRoundTripAndOptimisticVersion() throws Exception {
    AppUser user = users.save(AppUser.register("listing.user", "hash"));
    var data = mapper.readTree("{\"deal\":{\"type\":\"sale\",\"price\":14500000},"
        + "\"location\":{\"address\":\"г. Москва, ул. Примерная, 12\"}}");

    Listing saved = listings.save(Listing.newDraft(user.getId(), data));
    assertThat(saved.getVersion()).isEqualTo(1);

    Listing loaded = listings.findByIdAndUserId(saved.getId(), user.getId()).orElseThrow();
    assertThat(loaded.getStatus()).isEqualTo(ListingStatus.draft);
    assertThat(loaded.getData().get("deal").get("price").asInt()).isEqualTo(14_500_000);

    // Успешная генерация: ready требует результат (CHECK в схеме); версию не трогает.
    loaded.markReady(mapper.readTree("{\"channels\":[]}"));
    Listing updated = listings.save(loaded);
    assertThat(updated.getVersion()).isEqualTo(1);

    // Правка данных агентом: растит версию, сбрасывает в draft, но результат сохраняется.
    updated.editData(mapper.readTree("{\"deal\":{\"type\":\"sale\"}}"));
    Listing edited = listings.save(updated);
    assertThat(edited.getVersion()).isEqualTo(2);
    assertThat(edited.getStatus()).isEqualTo(ListingStatus.draft);
    assertThat(edited.getResult()).isNotNull();

    // Чужому пользователю объявление не видно.
    AppUser other = users.save(AppUser.register("other.user", "hash"));
    assertThat(listings.findByIdAndUserId(saved.getId(), other.getId())).isEmpty();
  }

  @Test
  void photoStatusesAndQuality() {
    AppUser user = users.save(AppUser.register("photo.user", "hash"));
    Listing listing = listings.save(Listing.newDraft(user.getId(),
        mapper.createObjectNode()));

    Photo uploaded = photos.save(Photo.uploaded(listing.getId(),
        "photos/original.jpg", "original.jpg", "image/jpeg", 1_024));
    uploaded.markPersisted();
    assertThat(uploaded.getStatus()).isEqualTo(PhotoStatus.processing);
    assertThat(uploaded.getQuality()).isNull();

    uploaded.markReady("photos/thumb.jpg", PhotoQuality.good,
        "Светлая гостиная", "Гостиная");
    Photo ready = photos.save(uploaded);
    assertThat(ready.getStatus()).isEqualTo(PhotoStatus.ready);
    assertThat(photos.countByListingId(listing.getId())).isEqualTo(1);
  }
}
