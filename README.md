# Докрутка объявления

Веб-сервис подготовки объявлений о недвижимости для Авито, ЦИАН и Telegram.

## Задачи на текущий спринт (до `23.10`)

1. Согласовать модель данных
2. Выбрать подход и сервисы для текста и фото
3. Сформировать первичный API контракт
4. Рабочий прототип фронта

## Запуск

Нужны Git и запущенный Docker с Docker Compose v2 или новее.

```sh
git clone https://github.com/ta4ilka69/fine-tuning-of-advertising.git
cd fine-tuning-of-advertising
docker compose up --build -d --wait
```

Приложение доступно на [localhost:8088](http://localhost:8088).

Swagger UI доступен на [localhost:8088/docs/](http://localhost:8088/docs/).
Контракт OpenAPI: [localhost:8088/docs/openapi.json](http://localhost:8088/docs/openapi.json).

Все команды Docker Compose выполняются из корня репозитория.

## Управление

Состояние контейнеров:

```sh
docker compose ps
```

Логи:

```sh
docker compose logs -f
```

Остановка:

```sh
docker compose down
```

Для запуска на другом порту:

```sh
WEB_PORT=8089 docker compose up --build -d --wait
```

## Разработка фронтенда

Нужны Node.js 24 и npm.

```sh
cd frontend
npm ci
npm run dev
```

Сервер разработки доступен на [localhost:5173](http://localhost:5173).
Документация API: [localhost:5173/docs/](http://localhost:5173/docs/).
Запросы `/api/` проксируются через `http://127.0.0.1:8088`.
Другой адрес задаётся при запуске:

```sh
API_PROXY_TARGET=http://127.0.0.1:8089 npm run dev
```

Сборка:

```sh
npm run build
```

## Тесты

Команды выполняются из `frontend/` после `npm ci`.

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

Для Chromium, Firefox и WebKit:

```sh
npx playwright install --with-deps
npm run test:browsers
```

Скриншотные эталоны хранятся в `frontend/tests/e2e/screenshots/`. Они сравниваются в Linux ARM64 в образе `mcr.microsoft.com/playwright:v1.64.1-noble`. Команда сравнения в этом окружении:

```sh
npm run test:visual
```

Для обновления эталонов запустите `Update screenshots` во вкладке Actions, выбрав ветку PR. Артефакт `screenshots-<SHA>` содержит каталог `chromium/`: его нужно поместить в `frontend/tests/e2e/screenshots/` и добавить изменения в PR. Обычный CI эталоны не обновляет.

В Actions сохраняются отчёты покрытия, браузерные отчёты и различия скриншотов на 14 дней. `Browser compatibility` проверяет три браузера ежедневно и запускается вручную. Проверка `Frontend required` объединяет обязательные проверки PR.

В PR тесты фронтенда запускаются при изменениях `frontend/` или его CI. Изменения только в `backend/` запускают проверку общего Compose без отдельных тестов фронтенда. Compose также проверяется при изменениях фронта и общей конфигурации запуска. Для PR только с README эти проверки пропускаются. Ручной запуск `Verify` выполняет все проверки.
