package com.adtune.backend.auth;

import com.adtune.backend.db.AppUser;
import com.adtune.backend.web.ApiProblem;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.MethodParameter;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/** Достаёт пользователя из cookie-сессии для параметров с @CurrentUser. */
public class CurrentUserArgumentResolver implements HandlerMethodArgumentResolver {

  private final AuthService authService;

  public CurrentUserArgumentResolver(AuthService authService) {
    this.authService = authService;
  }

  @Override
  public boolean supportsParameter(MethodParameter parameter) {
    return parameter.hasParameterAnnotation(CurrentUser.class)
        && AppUser.class.isAssignableFrom(parameter.getParameterType());
  }

  @Override
  public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer,
      NativeWebRequest webRequest, WebDataBinderFactory binderFactory) {
    HttpServletRequest request = webRequest.getNativeRequest(HttpServletRequest.class);
    String token = sessionCookie(request);
    return authService.resolve(token).orElseThrow(ApiProblem::unauthenticated);
  }

  private String sessionCookie(HttpServletRequest request) {
    Cookie[] cookies = request == null ? null : request.getCookies();
    if (cookies == null) {
      return null;
    }
    for (Cookie cookie : cookies) {
      if (AuthService.SESSION_COOKIE.equals(cookie.getName())) {
        return cookie.getValue();
      }
    }
    return null;
  }
}
