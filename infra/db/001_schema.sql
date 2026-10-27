-- Схема базы. Применяется только при первом запуске на пустом томе.
-- Модель и принятые решения описаны в infra/README.md.

CREATE TYPE user_role AS ENUM ('agent', 'admin');
CREATE TYPE listing_status AS ENUM ('draft', 'generating', 'ready', 'failed');
CREATE TYPE photo_status AS ENUM ('processing', 'ready', 'failed');

-- "user" — зарезервированное слово в PostgreSQL, поэтому таблица называется users.
CREATE TABLE users (
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    email         text NOT NULL CHECK (email LIKE '_%@_%'),
    password_hash text NOT NULL,
    role          user_role NOT NULL DEFAULT 'agent',
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_key ON users (lower(email));

-- В cookie лежит случайный токен, в базе только его хеш:
-- утечка базы не даёт войти чужими сессиями.
CREATE TABLE session (
    token_hash bytea PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);

CREATE INDEX session_user_id_idx ON session (user_id);
CREATE INDEX session_expires_at_idx ON session (expires_at);

CREATE TABLE channel (
    id                 uuid PRIMARY KEY DEFAULT uuidv7(),
    name               text NOT NULL UNIQUE,
    description        text NOT NULL DEFAULT '',
    is_active          boolean NOT NULL DEFAULT true,
    current_version_id uuid,
    created_at         timestamptz NOT NULL DEFAULT now()
);

-- Версии не удаляются: на них ссылаются результаты генерации.
-- Пустой лимит означает «без ограничения».
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

-- params формирует фронт. Бэкенд читает из него только address, price и deal для списка.
-- result перезаписывается только при успешной генерации; правка params возвращает
-- статус draft, но result сохраняет — так фронт понимает, что результат устарел.
-- version растёт при каждом сохранении и ловит одновременное редактирование.
CREATE TABLE listing (
    id         uuid PRIMARY KEY DEFAULT uuidv7(),
    user_id    uuid NOT NULL REFERENCES users ON DELETE CASCADE,
    version    integer NOT NULL DEFAULT 1 CHECK (version > 0),
    status     listing_status NOT NULL DEFAULT 'draft',
    params     jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(params) = 'object'),
    result     jsonb CHECK (jsonb_typeof(result) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX listing_user_id_updated_at_idx ON listing (user_id, updated_at DESC);

-- Оценку фото нейросеть ставит при загрузке; пока она не готова, status = processing.
CREATE TABLE photo (
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    listing_id  uuid NOT NULL REFERENCES listing ON DELETE CASCADE,
    s3_key      text NOT NULL UNIQUE,
    position    integer NOT NULL CHECK (position >= 0),
    status      photo_status NOT NULL DEFAULT 'processing',
    rate        smallint CHECK (rate BETWEEN 1 AND 3),
    description text,
    score_base  text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (listing_id, position) DEFERRABLE,
    CHECK (status <> 'ready' OR (rate IS NOT NULL AND description IS NOT NULL AND score_base IS NOT NULL))
);

-- Файлы удалённых фото, которые фоновая задача должна стереть из S3.
-- Заполняется триггером, поэтому каскадное удаление объявления или пользователя тоже попадает сюда.
CREATE TABLE s3_cleanup (
    s3_key     text PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION photo_queue_s3_cleanup() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO s3_cleanup (s3_key) SELECT s3_key FROM deleted_photos ON CONFLICT DO NOTHING;
    RETURN NULL;
END;
$$;

CREATE TRIGGER photo_queue_s3_cleanup
    AFTER DELETE ON photo
    REFERENCING OLD TABLE AS deleted_photos
    FOR EACH STATEMENT EXECUTE FUNCTION photo_queue_s3_cleanup();
