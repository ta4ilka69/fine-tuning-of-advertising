package com.adtune.backend.auth;

import com.adtune.backend.db.AppUser;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Параметр контроллера: текущий пользователь по cookie-сессии.
 * Без валидной сессии запрос получает 401 UNAUTHENTICATED.
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface CurrentUser {
}
