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

## Макеты

[Макеты, состояния интерфейса и прототипы](frontend/design/README.md).

## Тесты

[Запуск тестов и описание CI](frontend/tests/README.md).
