package com.adtune.backend.channel;

import com.adtune.backend.auth.CurrentUser;
import com.adtune.backend.config.TrustedOrigin;
import com.adtune.backend.db.AppUser;
import com.adtune.backend.db.UserRole;
import com.adtune.backend.web.ApiProblem;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
public class ChannelController {

  private final ChannelService channels;
  private final TrustedOrigin origin;

  public ChannelController(ChannelService channels, TrustedOrigin origin) {
    this.channels = channels;
    this.origin = origin;
  }

  public record Items<T>(List<T> items) {}

  @GetMapping("/channels")
  public Items<ChannelService.ChannelView> active(@CurrentUser AppUser user) {
    return new Items<>(channels.active());
  }

  @GetMapping("/admin/channels")
  public ResponseEntity<Items<ChannelService.AdminView>> list(@CurrentUser AppUser user) {
    requireAdmin(user);
    return ResponseEntity.ok().cacheControl(CacheControl.noStore())
        .body(new Items<>(channels.all()));
  }

  @PostMapping(path = "/admin/channels", consumes = "application/json")
  public ResponseEntity<ChannelService.AdminView> create(@CurrentUser AppUser user,
      HttpServletRequest request, @RequestBody JsonNode body) {
    requireAdmin(user);
    origin.require(request);
    return ResponseEntity.status(201).cacheControl(CacheControl.noStore())
        .body(channels.create(ChannelInput.parse(body, false)));
  }

  @PutMapping(path = "/admin/channels/{id}", consumes = "application/json")
  public ResponseEntity<ChannelService.AdminView> update(@CurrentUser AppUser user,
      HttpServletRequest request, @PathVariable UUID id, @RequestBody JsonNode body) {
    requireAdmin(user);
    origin.require(request);
    return ResponseEntity.ok().cacheControl(CacheControl.noStore())
        .body(channels.update(id, ChannelInput.parse(body, true)));
  }

  private static void requireAdmin(AppUser user) {
    if (user.getRole() != UserRole.admin) {
      throw new ApiProblem(403, "FORBIDDEN", "Требуется роль администратора.");
    }
  }
}
