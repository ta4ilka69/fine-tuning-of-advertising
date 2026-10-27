# Докрутка объявления

Веб-сервис подготовки объявлений о недвижимости для Авито, ЦИАН и Telegram.

[Страница проекта](https://ta4ilka69.github.io/fine-tuning-of-advertising/): состояние, сроки, задачи, риски и ссылки. Исходник — [site/index.html](site/index.html).

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

## Разработка бэкенда

Стек: Java 21, Spring Boot, Gradle. Локально устанавливать ничего не нужно —
сборка и тесты запускаются в Docker.

Ключи и настройки модели — в `backend/.env` (шаблон — `backend/.env.example`).

Тесты:

```sh
docker run --rm -v "$(pwd)/backend:/workspace" -v adtune-gradle-cache:/home/gradle/.gradle -w /workspace gradle:8.14.3-jdk21 gradle --no-daemon test
```

(в PowerShell вместо `$(pwd)` — `${PWD}`.)

Полный запуск вместе с фронтендом — как описано выше, `docker compose up --build -d --wait`;
бэкенд собирается из `./backend` и слушает внутренний порт `8000` за прокси фронтенда.
Демо-эндпоинт генерации: `POST http://localhost:8088/api/ai/demo`.

### Один реальный запрос к модели

Каждый вызов демо-эндпоинта — ровно один запрос к OpenAI API, токены тратятся.
Пример с минимальным расходом (одна площадка, короткий лимит текста) —
`backend/examples/demo-request-min.json`.

1. Запустить только бэкенд с опубликованным портом:

   ```sh
   docker run --rm -d --name backend-test -p 127.0.0.1:8009:8000 \
     --env-file backend/.env fine-tuning-of-advertising-backend
   ```

2. Один запрос:

   ```sh
   curl -s -X POST http://127.0.0.1:8009/api/ai/demo \
     -H "Content-Type: application/json; charset=utf-8" \
     --data-binary @backend/examples/demo-request-min.json
   ```

3. Подтверждение: `200` и сгенерированные тексты в ответе; строка
   `Модель … вернула результат за … мс` в `docker logs backend-test`;

После проверки: `docker rm -f backend-test`.

## База данных

[Модель данных, договорённости и пересоздание базы](infra/README.md).

## Макеты

[Макеты, состояния интерфейса и прототипы](frontend/design/README.md).

## Тесты

[Запуск тестов и описание CI](frontend/tests/README.md).
