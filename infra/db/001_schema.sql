-- Схема базы. Применяется только при первом запуске на пустом томе.
-- Модель и принятые решения описаны в infra/README.md, требования к MVP — в docs/requirements.md.

CREATE TYPE user_role AS ENUM ('agent', 'admin');
CREATE TYPE listing_status AS ENUM ('draft', 'generating', 'ready', 'failed');
CREATE TYPE photo_status AS ENUM ('processing', 'ready', 'failed');
CREATE TYPE photo_quality AS ENUM ('unfit', 'needs_fix', 'good');

-- "user" — зарезервированное слово в PostgreSQL, поэтому таблица называется users.
-- Логин хранится в нижнем регистре, поэтому уникальность без учёта регистра даёт обычный UNIQUE.
-- Админа назначают вручную: регистрация создаёт только агентов.
CREATE TABLE users (
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    login         text NOT NULL UNIQUE CHECK (login ~ '^[a-z0-9_.-]{3,32}$'),
    name          text CHECK (name ~ '\S'),
    password_hash text NOT NULL,
    role          user_role NOT NULL DEFAULT 'agent',
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- В cookie лежит случайный токен, в базе только его хеш:
-- утечка базы не даёт войти чужими сессиями. Срок жизни фиксированный, от момента входа.
CREATE TABLE session (
    token_hash bytea PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);

CREATE INDEX session_user_id_idx ON session (user_id);
CREATE INDEX session_expires_at_idx ON session (expires_at);

-- Площадки не удаляются, только выключаются: на их версии ссылаются результаты генерации.
CREATE TABLE channel (
    id                 uuid PRIMARY KEY DEFAULT uuidv7(),
    name               text NOT NULL UNIQUE,
    description        text NOT NULL DEFAULT '',
    is_active          boolean NOT NULL DEFAULT true,
    current_version_id uuid NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now()
);

-- Версии не меняются и не удаляются: на них ссылаются результаты генерации.
-- Пустой лимит означает «без ограничения», лишнее бэкенд обрезает.
CREATE TABLE channel_version (
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    channel_id  uuid NOT NULL REFERENCES channel,
    number      integer NOT NULL CHECK (number > 0),
    instruction text NOT NULL,
    checklist   jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(checklist) = 'array'),
    title_limit integer CHECK (title_limit > 0),
    text_limit  integer CHECK (text_limit > 0),
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (channel_id, number),
    UNIQUE (channel_id, id)
);

-- Текущей может быть только версия этой же площадки. Проверка отложена до конца
-- транзакции, чтобы площадку и её первую версию можно было создать вместе.
ALTER TABLE channel
    ADD FOREIGN KEY (id, current_version_id) REFERENCES channel_version (channel_id, id)
    DEFERRABLE INITIALLY DEFERRED;

-- data формирует фронт, бэкенд передаёт его в генерацию целиком.
-- result перезаписывается только при успешной генерации; правка data возвращает
-- статус draft, но result сохраняет — так фронт понимает, что результат устарел.
-- Во время генерации объявление заблокировано; генерация дольше 50 секунд сбрасывается в failed.
-- version растёт при каждом сохранении и ловит одновременное редактирование.
-- updated_at меняют только действия агента, завершение генерации его не трогает.
CREATE TABLE listing (
    id                    uuid PRIMARY KEY DEFAULT uuidv7(),
    user_id               uuid NOT NULL REFERENCES users ON DELETE CASCADE,
    version               integer NOT NULL DEFAULT 1 CHECK (version > 0),
    status                listing_status NOT NULL DEFAULT 'draft',
    data                  jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(data) = 'object'),
    result                jsonb CHECK (jsonb_typeof(result) = 'object'),
    generation_started_at timestamptz,
    generation_error      text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CHECK (status <> 'ready' OR result IS NOT NULL),
    CHECK (status <> 'generating' OR generation_started_at IS NOT NULL),
    CHECK ((status = 'failed') = (generation_error IS NOT NULL))
);

CREATE INDEX listing_user_id_updated_at_idx ON listing (user_id, updated_at DESC);

-- Порядок фото — порядок загрузки, то есть по id (UUID v7 растёт со временем).
-- Оценку фото нейросеть ставит при загрузке; пока превью и оценка не готовы, status = processing.
-- Фото в статусе failed не обрабатывается повторно: агент удаляет его и загружает заново.
CREATE TABLE photo (
    id               uuid PRIMARY KEY DEFAULT uuidv7(),
    listing_id       uuid NOT NULL REFERENCES listing ON DELETE CASCADE,
    s3_key           text NOT NULL UNIQUE,
    thumbnail_s3_key text UNIQUE,
    file_name        text NOT NULL,
    mime_type        text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png')),
    size_bytes       integer NOT NULL CHECK (size_bytes > 0),
    status           photo_status NOT NULL DEFAULT 'processing',
    error            text,
    quality          photo_quality,
    quality_reason   text,
    scene            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CHECK (status <> 'ready' OR (thumbnail_s3_key IS NOT NULL AND quality IS NOT NULL
        AND quality_reason IS NOT NULL AND scene IS NOT NULL)),
    CHECK ((status = 'failed') = (error IS NOT NULL))
);

CREATE INDEX photo_listing_id_idx ON photo (listing_id);

-- Файлы удалённых фото, которые фоновая задача должна стереть из хранилища.
-- Заполняется триггером, поэтому каскадное удаление объявления или пользователя тоже попадает сюда.
CREATE TABLE file_cleanup (
    file_key   text PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION photo_queue_file_cleanup() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO file_cleanup (file_key)
    SELECT key
    FROM deleted_photos, LATERAL (VALUES (s3_key), (thumbnail_s3_key)) AS keys (key)
    WHERE key IS NOT NULL
    ON CONFLICT DO NOTHING;
    RETURN NULL;
END;
$$;

CREATE TRIGGER photo_queue_file_cleanup
    AFTER DELETE ON photo
    REFERENCING OLD TABLE AS deleted_photos
    FOR EACH STATEMENT EXECUTE FUNCTION photo_queue_file_cleanup();
