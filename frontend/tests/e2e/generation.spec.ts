import { test, expect } from './login-fixture';
import { generationError, listingDetails } from '../fixtures/listings';

const original = listingDetails();
const id = original.id;
const listingPath = `/api/v1/listings/${id}`;
const panel = 'Подготовка объявления';
const first = { id: 'f986b179-311a-4a11-b158-93a5608d0324', name: 'Новая площадка', description: 'Тексты для каталога', limits: { titleLimit: 100, textLimit: null }, number: 2 };
const second = { ...first, id: '6cbd508d-d058-4e1b-97cd-c230f49d2567', name: 'Лента объявлений' };
const warning = { field: '/object/kitchenArea', code: 'AREA_MISMATCH', message: 'Площадь кухни больше общей' };
const required = { field: '/object/totalArea', code: 'REQUIRED', message: 'Укажите общую площадь' };
const generating = { ...original, status: 'generating', updatedAt: '2026-10-24T12:01:00Z' };
const failed = { ...original, status: 'failed', generationError, updatedAt: '2026-10-24T12:02:00Z' };
const problem = (status: number, code: string) => ({ ...generationError, status, code });

const flow = test.extend<{ flow: { launch: () => ReturnType<import('@playwright/test').Page['getByRole']>; choose: () => Promise<void>; posts: unknown[]; validations: unknown[] } }>({
  flow: async ({ page, loginServer, context }, provide) => {
    await context.addCookies([{ name: 'session', value: 'test-session', url: `${loginServer.url}/api/v1` }]);
    const posts: unknown[] = [];
    const validations: unknown[] = [];
    await page.route('**/api/v1/channels', (route) => route.fulfill({ json: { items: [first, second, first] } }));
    await page.route(`**${listingPath}/validate`, (route) => {
      validations.push(route.request().postDataJSON());
      return route.fulfill({ json: { version: original.version, canGenerate: true, errors: [], warnings: [warning] } });
    });
    await page.route(`**${listingPath}/generations`, (route) => {
      posts.push(route.request().postDataJSON());
      loginServer.controls.detail = generating;
      return route.fulfill({ status: 202, json: generating });
    });
    const section = page.getByRole('region', { name: panel });
    await provide({
      launch: () => section.getByRole('button', { name: /^(Сгенерировать|Повторить генерацию)$/ }),
      choose: async () => {
        await page.goto(`${loginServer.url}/app/listings/${id}`);
        await section.getByRole('button', { name: 'Выбрать площадки' }).click();
        await section.getByRole('checkbox', { name: first.name }).check();
      },
      posts, validations,
    });
  },
});

flow('площадки загружаются с API, ошибки и пустой список можно перечитать', async ({ page, loginServer, flow }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  await page.route('**/api/v1/channels', async (route) => {
    if (++calls === 1) { await held; await route.fulfill({ status: 503, json: {} }); return; }
    await route.fulfill({ json: { items: calls === 2 ? [] : [first] } });
  });
  await page.goto(`${loginServer.url}/app/listings/${id}`);
  try {
    await page.getByRole('button', { name: 'Выбрать площадки' }).click();
    await expect(page.getByText('Загружаем площадки')).toBeVisible();
  } finally { release(); }
  await page.getByRole('button', { name: 'Повторить загрузку площадок' }).click();
  await expect(page.getByText('Нет доступных площадок')).toBeVisible();
  await page.getByRole('button', { name: 'Обновить площадки' }).click();
  await expect(page.getByRole('checkbox', { name: first.name })).toBeVisible();
  await expect(flow.launch()).toBeDisabled();
  await page.getByRole('checkbox', { name: first.name }).check();
  await expect(flow.launch()).toBeEnabled();
  await page.getByRole('checkbox', { name: first.name }).uncheck();
  await expect(flow.launch()).toBeDisabled();
  expect(flow.posts).toEqual([]);
});

flow('двойной клик отправляет один запуск с выбранными ID; предупреждение не блокирует, опрос получает ready', async ({ page, loginServer, flow }) => {
  await flow.choose();
  await page.getByRole('checkbox', { name: second.name }).check();
  await flow.launch().evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByText('Готовим тексты и рекомендации')).toBeVisible();
  await expect(page.getByText(warning.message)).toBeVisible();
  await expect(page.getByText('Предыдущий результат сохранён')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Редактировать объявление', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Удалить объявление', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Выбрать фотографии', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Удалить фотографию room.jpg', exact: true })).toBeDisabled();
  await expect(flow.launch()).toBeDisabled();
  expect(flow.validations).toEqual([{ expectedVersion: original.version }]);
  expect(flow.posts).toEqual([{ expectedVersion: original.version, channelIds: [first.id, second.id] }]);
  loginServer.controls.detail = { ...original, updatedAt: '2026-10-24T12:03:00Z' };
  await expect(page.getByText('Подготовка завершена', { exact: true })).toBeVisible();
  await expect(flow.launch()).toBeEnabled();
});

flow('ошибки проверки запрещают запуск, 422 показывает ошибки полей', async ({ page, flow }) => {
  await flow.choose();
  await page.route(`**${listingPath}/validate`, (route) => route.fulfill({
    json: { version: original.version, canGenerate: false, errors: [required], warnings: [warning] },
  }), { times: 1 });
  await flow.launch().click();
  await expect(page.getByText(required.message)).toBeVisible();
  await expect(page.getByText(warning.message)).toBeVisible();
  expect(flow.posts).toEqual([]);
  await page.route(`**${listingPath}/generations`, (route) => route.fulfill({ status: 422, contentType: 'application/problem+json', json: {
    ...problem(422, 'VALIDATION_ERROR'), fieldErrors: [{ ...required, field: '/channelIds', message: 'Выбранная площадка недоступна' }],
  } }));
  await flow.launch().click();
  await expect(page.getByText('Выбранная площадка недоступна')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Обновить площадки' })).toBeEnabled();
});

for (const photoStatus of ['missing', 'processing', 'failed']) {
  flow(`фото ${photoStatus} блокируют запуск`, async ({ loginServer, flow }) => {
    loginServer.controls.detail = { ...original, photos: photoStatus === 'missing' ? [] : [...original.photos, {
      ...original.photos[0], id: 'dcb3b59f-389a-46e7-b6fc-9f760ea02b92', status: photoStatus,
      thumbnailUrl: null, contentUrl: null, error: photoStatus === 'failed' ? problem(422, 'PHOTO_PROCESSING_FAILED') : null,
    }].map((photo, index) => index === 0 ? photo : { ...photo, contentUrl: `${listingPath}/photos/${photo.id}/content` }) };
    await flow.choose();
    await expect(flow.launch()).toBeDisabled();
    expect(flow.validations).toEqual([]);
  });
}

flow('после перезагрузки опрос получает failed и оставляет прежний результат', async ({ page, loginServer, flow }) => {
  loginServer.controls.detail = generating;
  await page.goto(`${loginServer.url}/app/listings/${id}`);
  await expect(page.getByText('Готовим тексты и рекомендации')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Готовим тексты и рекомендации')).toBeVisible();
  loginServer.controls.detail = { ...failed, result: null };
  await expect(page.getByText('Не удалось подготовить результат')).toBeVisible();
  await expect(page.getByText('Сохранённый результат', { exact: true })).toBeVisible();
  await expect(page.getByText('Предыдущий результат сохранён')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Удалить объявление', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Выбрать площадки' }).click();
  await page.getByRole('checkbox', { name: first.name }).check();
  await expect(flow.launch()).toBeEnabled();
  expect(flow.posts).toEqual([]);
});

flow('потерянный 202: сверка через GET без повторного POST', async ({ page, loginServer, flow }) => {
  await flow.choose();
  let starts = 0;
  await page.route(`**${listingPath}/generations`, async (route) => {
    starts++;
    loginServer.controls.detail = generating;
    await route.abort('failed');
  });
  await flow.launch().click();
  await expect(page.getByText('Готовим тексты и рекомендации')).toBeVisible();
  expect(loginServer.calls.filter((call) => call.path === listingPath && call.method === 'GET').length).toBeGreaterThanOrEqual(2);
  loginServer.controls.detail = failed;
  await expect(page.getByText('Не удалось подготовить результат')).toBeVisible();
  expect(starts).toBe(1);
});

flow('новый результат подтверждает быстрый повтор после потерянного 202 без изменения даты', async ({ page, loginServer, flow }) => {
  await flow.choose();
  const result = structuredClone(original.result!);
  result.channels[0]!.title = 'Обновлённый заголовок';
  let attempts = 0;
  await page.route(`**${listingPath}/generations`, (route) => {
    attempts += 1;
    loginServer.controls.detail = { ...original, result };
    return route.abort('failed');
  });
  await flow.launch().click();
  await expect.poll(() => loginServer.calls.filter((call) => call.path === listingPath && call.method === 'GET').length).toBeGreaterThan(1);
  await expect(flow.launch()).toBeEnabled();
  await expect(page.getByText('Подготовка завершена', { exact: true })).toBeVisible();
  await expect(page.getByText('Не удалось подтвердить запуск. Проверьте состояние объявления')).toHaveCount(0);
  expect(attempts).toBe(1);
});

flow('общий 409 проверки обновляет версию и сохраняет сообщение о конфликте', async ({ page, loginServer, flow }) => {
  await flow.choose();
  const fresh = { ...original, version: original.version + 1, updatedAt: generating.updatedAt };
  await page.route(`**${listingPath}/validate`, (route) => {
    loginServer.controls.detail = fresh;
    return route.fulfill({ status: 409, contentType: 'application/problem+json', json: problem(409, 'CONFLICT') });
  }, { times: 1 });
  await flow.launch().click();
  await expect(page.getByText('Объявление изменилось. Проверьте актуальные данные перед запуском')).toBeVisible();
  expect(flow.posts).toHaveLength(0);
  await expect(flow.launch()).toBeEnabled();
  await flow.launch().click();
  await expect.poll(() => flow.validations).toEqual([{ expectedVersion: fresh.version }]);
});

for (const status of [403, 404]) {
  flow(`отказ ${status} в проверке генерации не скрывает доступную карточку`, async ({ page, loginServer, flow }) => {
    await flow.choose();
    await page.route(`**${listingPath}/validate`, (route) => route.fulfill({
      status, contentType: 'application/problem+json', json: problem(status, status === 403 ? 'FORBIDDEN' : 'NOT_FOUND'),
    }));
    await flow.launch().click();
    await expect(page.getByText('Сервер не разрешил запустить генерацию. Попробуйте позже')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Редактировать объявление', exact: true })).toBeEnabled();
    expect(loginServer.calls.filter((call) => call.path === listingPath && call.method === 'GET')).toHaveLength(2);
    expect(flow.posts).toHaveLength(0);
  });
}

flow('при 429 опроса кнопка показывает паузу, следующий GET получает готовый результат', async ({ page, loginServer, flow }) => {
  await flow.choose();
  await page.route(`**${listingPath}`, (route) => route.fulfill({
    status: 429, contentType: 'application/problem+json', json: problem(429, 'TOO_MANY_REQUESTS'), headers: { 'Retry-After': '3' },
  }), { times: 1 });
  await flow.launch().click();
  await expect(page.getByRole('button', { name: /^Проверить через \d+ с$/ })).toBeDisabled();
  loginServer.controls.detail = { ...original };
  await expect(page.getByText('Подготовка завершена', { exact: true })).toBeVisible();
  expect(flow.posts).toHaveLength(1);
});

flow('неудачная сверка после потери ответа блокирует новый запуск до успешного GET', async ({ page, loginServer, flow }) => {
  await flow.choose();
  await page.route(`**${listingPath}/generations`, async (route) => {
    loginServer.controls.detailError = 503;
    await route.abort('failed');
  }, { times: 1 });
  await flow.launch().click();
  await expect(page.getByText('Не удалось проверить состояние', { exact: true })).toBeVisible();
  await expect(flow.launch()).toBeDisabled();
  loginServer.controls.detailError = null;
  await page.getByRole('button', { name: 'Проверить состояние', exact: true }).click();
  await expect(flow.launch()).toBeEnabled();
  expect(flow.posts).toEqual([]);
  await flow.launch().click();
  await expect(page.getByText('Готовим тексты и рекомендации')).toBeVisible();
  expect(flow.posts).toHaveLength(1);
});

for (const code of ['VERSION_CONFLICT', 'LISTING_BUSY']) {
  flow(`${code}: GET обновляет карточку без повтора запуска`, async ({ page, loginServer, flow }) => {
    await flow.choose();
    await page.route(`**${listingPath}/generations`, (route) => {
      loginServer.controls.detail = code === 'LISTING_BUSY' ? generating : { ...original, version: 3, data: { location: { address: 'Новый адрес объекта' } } };
      return route.fulfill({ status: 409, contentType: 'application/problem+json', json: problem(409, code) });
    });
    await flow.launch().click();
    if (code === 'LISTING_BUSY') await expect(page.getByText('Готовим тексты и рекомендации')).toBeVisible();
    else await expect(page.getByText('Новый адрес объекта', { exact: true })).toBeVisible();
    expect(flow.validations).toHaveLength(1);
    expect(flow.posts).toHaveLength(0);
  });
}

flow('429 учитывает Retry-After и разрешает только ручной повтор', async ({ page, flow }) => {
  await flow.choose();
  await page.route(`**${listingPath}/generations`, (route) => route.fulfill({
    status: 429, contentType: 'application/problem+json', headers: { 'Retry-After': '2' }, json: problem(429, 'RATE_LIMITED'),
  }), { times: 1 });
  await flow.launch().click();
  await expect(page.getByRole('button', { name: /^Повторить через [12] с$/ })).toBeDisabled();
  await expect(flow.launch()).toBeEnabled();
  expect(flow.validations).toHaveLength(1);
  expect(flow.posts).toEqual([]);
  await flow.launch().click();
  await expect(page.getByText('Готовим тексты и рекомендации')).toBeVisible();
  expect(flow.posts).toHaveLength(1);
});

flow('401 во время опроса запускает существующую проверку сессии', async ({ page, loginServer, flow }) => {
  await flow.choose();
  await flow.launch().click();
  await expect(page.getByText('Готовим тексты и рекомендации')).toBeVisible();
  loginServer.controls.detailError = 401;
  loginServer.controls.meError = 401;
  await expect(page).toHaveURL(`${loginServer.url}/login`);
  expect(flow.posts).toHaveLength(1);
});

flow('уход со страницы отменяет активный опрос и отбрасывает поздний ответ', async ({ page, loginServer, flow }) => {
  await flow.choose();
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**${listingPath}`, async (route) => { await held; await route.fulfill({ json: failed }).catch(() => {}); });
  await flow.launch().click();
  const polling = await page.waitForRequest((request) => new URL(request.url()).pathname === listingPath);
  const canceled = page.waitForEvent('requestfailed', { predicate: (request) => request === polling });
  try {
    await page.getByRole('button', { name: '← Мои объявления' }).click();
    await expect(page).toHaveURL(`${loginServer.url}/app`);
    await canceled;
  } finally { release(); }
  await expect(page.getByText('Не удалось подготовить результат')).toHaveCount(0);
});

flow('смена пользователя отменяет опрос и не показывает прежний результат новой сессии', async ({ page, loginServer, flow }) => {
  await flow.choose();
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const poll = page.waitForRequest((request) => new URL(request.url()).pathname === listingPath);
  await page.route(`**${listingPath}`, async (route) => { await held; await route.fulfill({ json: failed }).catch(() => {}); }, { times: 1 });
  await flow.launch().click();
  const polling = await poll;
  const canceled = page.waitForEvent('requestfailed', { predicate: (request) => request === polling });
  loginServer.controls.userId = '8adb535f-df6c-42d8-a2b6-a8f22737ee3e';
  loginServer.controls.detail = { ...original, status: 'draft', result: null, data: { location: { address: 'Карточка новой сессии' } } };
  try {
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await expect(page.getByText('Карточка новой сессии')).toBeVisible();
    await canceled;
  } finally { release(); }
  await expect(page.getByText('Сохранённый результат', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Не удалось подготовить результат')).toHaveCount(0);
});

for (const width of [1440, 390]) {
  flow(`подготовка объявления: ожидание и ошибка, ${width} px @visual @capture`, async ({ page, loginServer, flow }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await flow.choose();
    const section = page.getByRole('region', { name: panel });
    await flow.launch().click();
    await expect(section.getByText('Готовим тексты и рекомендации')).toBeVisible();
    await section.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    for (const state of ['waiting', 'failed']) {
      if (state === 'failed') {
        loginServer.controls.detail = failed;
        await expect(section.getByText('Не удалось подготовить результат')).toBeVisible();
        await section.scrollIntoViewIfNeeded();
      }
      const file = testInfo.outputPath(`generation-${state}-${width}.png`);
      await page.screenshot({ path: file, animations: 'disabled', caret: 'hide' });
      await testInfo.attach(`generation-${state}-${width}`, { path: file, contentType: 'image/png' });
    }
  });
}
