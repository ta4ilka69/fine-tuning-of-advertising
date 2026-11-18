package com.adtune.backend.config;

import com.adtune.backend.web.ApiProblem;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class TrustedOrigin {

  private final Set<String> allowed;

  public TrustedOrigin(@Value("${APP_TRUSTED_ORIGINS:http://localhost:8088,http://127.0.0.1:8088,http://localhost:5173,http://127.0.0.1:5173}") String origins) {
    allowed = Arrays.stream(origins.split(","))
        .map(String::strip)
        .filter(origin -> !origin.isEmpty() && !origin.equals("null"))
        .collect(Collectors.toUnmodifiableSet());
  }

  public void require(HttpServletRequest request) {
    var origins = request.getHeaders("Origin");
    if (!origins.hasMoreElements()) {
      throw forbidden();
    }
    String origin = origins.nextElement();
    if (origins.hasMoreElements() || !allowed.contains(origin)) {
      throw forbidden();
    }
  }

  private static ApiProblem forbidden() {
    return new ApiProblem(403, "FORBIDDEN", "Недопустимый источник запроса.");
  }
}
