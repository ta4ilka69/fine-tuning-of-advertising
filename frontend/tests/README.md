# Тесты фронтенда

Нужны Node.js 24 и npm. Команды выполняются из `frontend/` после `npm ci`.

```sh
npm run check
npm run check:api
npm run test:coverage
npm run build
npm run check:bundle
npx playwright install chromium
npm run test:e2e
```

Покрытие доступно в `frontend/coverage/index.html`. Минимум: 80% строк, инструкций и функций, 75% ветвей условий. Проверки браузера запускают собранное приложение автоматически.

## Браузеры

Для Chromium, Firefox и WebKit:

```sh
npx playwright install --with-deps
npm run test:browsers
```

## Скриншоты

Скриншотные эталоны хранятся в `frontend/tests/e2e/screenshots/`. Они сравниваются в Linux ARM64 в образе `mcr.microsoft.com/playwright:v1.64.1-noble`. Команда сравнения в этом окружении:

```sh
npm run test:visual
```

Для обновления эталонов запустите `Update screenshots` во вкладке Actions, выбрав ветку PR. Артефакт `screenshots-<SHA>` содержит каталог `chromium/`: его нужно поместить в `frontend/tests/e2e/screenshots/` и добавить изменения в PR. Обычный CI эталоны не обновляет.

## CI

В Actions сохраняются отчёты покрытия, браузерные отчёты и различия скриншотов на 14 дней. `Browser compatibility` проверяет три браузера ежедневно и запускается вручную. Проверка `Frontend required` объединяет обязательные проверки PR.

В PR тесты фронтенда запускаются при изменениях `frontend/` или его CI. Изменения только в `backend/` запускают проверку общего Compose без отдельных тестов фронтенда. Compose также проверяется при изменениях фронта и общей конфигурации запуска. Изменения только корневого README не запускают эти проверки. Ручной запуск `Verify` выполняет все проверки.
