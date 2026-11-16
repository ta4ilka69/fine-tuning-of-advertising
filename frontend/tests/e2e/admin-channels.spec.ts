import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Page, Route } from '@playwright/test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { AdminChannel, AdminChannelUpdate, AdminChannelWrite } from '../../src/shared/api/admin-channels';
import { expect, test } from './fixtures';

const path = '/admin/channels';
const channelAPI = '**/api/v1/admin/channels';
const user = { id: '9a07b31d-ac15-495c-bb91-e3756fe40bcc', login: 'admin_demo', role: 'admin' };
const requestId = 'a6cdd08a-a252-48fa-a6c5-73f485bc494e';
const write: AdminChannelWrite = {
  name: 'Авито', description: 'Объявления о недвижимости', limits: { titleLimit: 60, textLimit: null },
  instruction: 'Подготовь объявление на русском языке.', checklist: ['Укажи тип объекта.', 'Добавь условия сделки.'], isActive: false,
};
const active: AdminChannel = { ...write, isActive: true, id: '74a2e9c3-e824-4329-bec2-e536101ecc04', number: 2 };
const inactive: AdminChannel = { ...write, name: 'ЦИАН', id: '2d301f5f-66fe-4118-85cc-a224db76f140', number: 1 };
const created: AdminChannel = { ...write, id: '0845e7a8-73b7-4c04-a0f3-7d24817970bb', number: 1 };

const contract = JSON.parse(readFileSync(new URL('../../public/docs/openapi.json', import.meta.url), 'utf8')) as object;
const contractId = 'urn:advertising:api';
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: contractId, ...contract });
const channelOperation = '#/paths/~1admin~1channels';
const updateOperation = `${channelOperation}~1{id}/put`;
const validators = {
  list: ajv.compile({ $ref: `${contractId}${channelOperation}/get/responses/200/content/application~1json/schema` }),
  write: ajv.compile({ $ref: `${contractId}${channelOperation}/post/requestBody/content/application~1json/schema` }),
  created: ajv.compile({ $ref: `${contractId}${channelOperation}/post/responses/201/content/application~1json/schema` }),
  update: ajv.compile({ $ref: `${contractId}${updateOperation}/requestBody/content/application~1json/schema` }),
  updated: ajv.compile({ $ref: `${contractId}${updateOperation}/responses/200/content/application~1json/schema` }),
  problem: ajv.compile({ $ref: `${contractId}#/components/schemas/Problem` }),
};

function assertContract(key: keyof typeof validators, body: unknown) {
  const validate = validators[key];
  expect(validate(body), ajv.errorsText(validate.errors)).toBe(true);
}

async function respond(route: Route, status: number, body: unknown, key: keyof typeof validators) {
  assertContract(key, body);
  await route.fulfill({
    status, body: JSON.stringify(body), contentType: status < 400 ? 'application/json' : 'application/problem+json',
    headers: { 'Cache-Control': 'no-store' },
  });
}

function problem(status: number, code: string) {
  return { type: 'about:blank', title: 'Не удалось выполнить запрос', status, code, requestId };
}

async function session(page: Page, role: 'admin' | 'agent' | null = 'admin') {
  await page.route('**/api/v1/auth/me', (route) => role
    ? route.fulfill({ json: { user: { ...user, role } } })
    : respond(route, 401, problem(401, 'UNAUTHENTICATED'), 'problem'));
}

async function fillForm(page: Page) {
  await page.getByRole('textbox', { name: 'Название' }).fill(` ${write.name} `);
  await page.getByRole('textbox', { name: 'Описание' }).fill(write.description);
  await page.getByRole('textbox', { name: 'Максимум символов в заголовке' }).fill(String(write.limits.titleLimit));
  await page.getByRole('textbox', { name: 'Системный промпт' }).fill(write.instruction);
  await page.getByRole('textbox', { name: 'Правило 1' }).fill(write.checklist[0]!);
  await page.getByRole('button', { name: 'Добавить правило' }).click();
  await page.getByRole('textbox', { name: 'Правило 2' }).fill(write.checklist[1]!);
  await page.getByRole('switch', { name: 'Площадка включена' }).uncheck();
}

test('защищённые маршруты недоступны агенту и не обращаются к API', async ({ page }) => {
  await session(page, 'agent');
  const calls: string[] = [];
  await page.route('**/api/v1/admin/**', (route) => { calls.push(route.request().method()); return route.abort(); });
  for (const url of [path, `${path}/new`, `${path}/${created.id}`]) {
    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'Доступ ограничен' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'К моим объявлениям' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Площадки' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Создать площадку' })).toHaveCount(0);
  }
  expect(calls).toEqual([]);
});

test('прямой переход без сессии открывает вход, запросов к админскому API нет', async ({ page }) => {
  await session(page, null);
  const calls: string[] = [];
  await page.route('**/api/v1/admin/**', (route) => { calls.push(route.request().method()); return route.abort(); });
  for (const url of [path, `${path}/new`, `${path}/${created.id}`]) {
    await page.goto(url);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('form', { name: 'Вход в аккаунт' })).toBeVisible();
  }
  expect(calls).toEqual([]);
});

for (const width of [320, 1440]) {
  test(`администратор открывает площадки через общую навигацию при ширине ${width} px`, async ({ page }) => {
    await session(page);
    await page.route('**/api/v1/listings?*', (route) => route.fulfill({ json: { items: [], nextCursor: null } }));
    await page.route(channelAPI, (route) => {
      expect(route.request().method()).toBe('GET');
      return respond(route, 200, { items: [active, inactive] }, 'list');
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/app');
    if (width === 320) {
      await page.getByRole('button', { name: /Меню пользователя:/ }).click();
      await page.getByRole('menuitem', { name: 'Площадки' }).click();
    } else {
      await page.getByRole('link', { name: 'Площадки' }).click();
      await expect(page.getByRole('link', { name: 'Площадки' })).toHaveAttribute('aria-current', 'page');
    }
    const list = page.getByRole('list', { name: 'Список площадок' });
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(list.getByRole('listitem').filter({ hasText: active.name })).toContainText('Включена');
    await expect(list.getByRole('listitem').filter({ hasText: inactive.name })).toContainText('Выключена');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 320) {
      const create = page.getByRole('button', { name: 'Создать площадку' });
      expect((await create.boundingBox())?.width).toBe((await list.boundingBox())?.width);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await list.getByRole('link', { name: `Настройки: ${inactive.name}` }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${path}/${inactive.id}$`));
    await expect(page.getByRole('heading', { name: 'Настройки: ЦИАН' })).toBeVisible();
  });
}

test('загрузка, ошибка и повтор с пустым результатом', async ({ page }) => {
  await session(page);
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  let attempt = 0;
  await page.route(channelAPI, async (route) => {
    if (++attempt === 1) {
      await hold;
      return respond(route, 503, problem(503, 'SERVICE_UNAVAILABLE'), 'problem');
    }
    return respond(route, 200, { items: [] }, 'list');
  });
  try {
    await page.goto(path);
    await expect(page.getByText('Загружаем площадки')).toBeVisible();
    await expect(page.getByText('Пока нет площадок')).toHaveCount(0);
    release();
    await expect(page.getByRole('alert')).toContainText('Не удалось загрузить площадки');
    await page.getByRole('button', { name: 'Повторить' }).click();
    await expect(page.getByText('Пока нет площадок')).toBeVisible();
    expect(attempt).toBe(2);
    await page.getByRole('status').getByRole('button', { name: 'Создать площадку' }).click();
    await expect(page.getByRole('heading', { name: 'Новая площадка' })).toBeVisible();
  } finally {
    release();
  }
});

test('форма на узком экране отправляет AdminChannelWrite и открывает настройки по ID из ответа', async ({ page }) => {
  await session(page);
  const calls: unknown[] = [];
  await page.route(channelAPI, (route) => {
    if (route.request().method() === 'GET') return respond(route, 200, { items: [created] }, 'list');
    expect(route.request().method()).toBe('POST');
    const body: unknown = route.request().postDataJSON();
    assertContract('write', body);
    calls.push(body);
    return respond(route, 201, created, 'created');
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(`${path}/new`);
  const submit = page.getByRole('button', { name: 'Создать площадку' });
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('Проверьте данные площадки');
  await expect(page.getByRole('textbox', { name: 'Название' })).toBeFocused();
  await expect(page.getByText('Введите системный промпт')).toBeVisible();
  await expect(page.getByText('Введите текст правила')).toBeVisible();
  expect(calls).toEqual([]);
  await fillForm(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await submit.click();
  await expect(page).toHaveURL(new RegExp(`${path}/${created.id}$`));
  await expect(page.getByRole('heading', { name: 'Настройки: Авито' })).toBeVisible();
  expect(calls).toEqual([write]);
});

test('ошибки 422 и 409 отмечают нужные поля, сохраняют форму и позволяют повторить POST', async ({ page }) => {
  await session(page);
  const calls: AdminChannelWrite[] = [];
  await page.route(channelAPI, (route) => {
    if (route.request().method() === 'GET') return respond(route, 200, { items: [created] }, 'list');
    expect(route.request().method()).toBe('POST');
    const body = route.request().postDataJSON() as AdminChannelWrite;
    assertContract('write', body);
    calls.push(body);
    if (calls.length === 1) return respond(route, 422, {
      ...problem(422, 'VALIDATION_FAILED'),
      fieldErrors: [{ field: '/checklist/1', code: 'VALIDATION_FAILED', message: 'Уточните второе правило' }],
    }, 'problem');
    if (calls.length === 2) return respond(route, 409, problem(409, 'CONFLICT'), 'problem');
    return respond(route, 201, { ...created, ...body }, 'created');
  });
  await page.goto(`${path}/new`);
  await fillForm(page);
  const submit = page.getByRole('button', { name: 'Создать площадку' });
  await submit.click();
  const rule = page.getByRole('textbox', { name: 'Правило 2' });
  await expect(rule).toHaveAccessibleDescription('Уточните второе правило');
  await expect(rule).toBeFocused();
  await rule.fill('Укажи цену.');
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('Название уже занято');
  const name = page.getByRole('textbox', { name: 'Название' });
  await expect(name).toHaveValue(` ${write.name} `);
  await expect(name).toBeFocused();
  await expect(rule).toHaveValue('Укажи цену.');
  await expect(page.getByRole('textbox', { name: 'Системный промпт' })).toHaveValue(write.instruction);
  await name.fill('Новая площадка');
  await submit.click();
  await expect(page).toHaveURL(new RegExp(`${path}/${created.id}$`));
  expect(calls).toEqual([write, { ...write, checklist: [write.checklist[0], 'Укажи цену.'] }, {
    ...write, name: 'Новая площадка', checklist: [write.checklist[0], 'Укажи цену.'],
  }]);
});

test('чек-лист управляется с клавиатуры, с нижней кнопки видна общая ошибка отправки', async ({ page }) => {
  await session(page);
  await page.route(channelAPI, (route) => {
    expect(route.request().method()).toBe('POST');
    assertContract('write', route.request().postDataJSON());
    return respond(route, 503, problem(503, 'SERVICE_UNAVAILABLE'), 'problem');
  });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(`${path}/new`);
  await fillForm(page);
  const add = page.getByRole('button', { name: 'Добавить правило' });
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Правило 3' })).toBeFocused();
  await page.getByRole('button', { name: 'Удалить правило 3' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Правило 2' })).toBeFocused();

  await page.getByRole('button', { name: 'Создать площадку' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Не удалось создать площадку');
  await expect(alert).toBeInViewport();
  await expect(page.getByRole('textbox', { name: 'Правило 2' })).toHaveValue(write.checklist[1]!);
});

test('ошибка выхода возвращает администратора к заполненной форме', async ({ page }) => {
  await session(page);
  await page.route('**/api/v1/auth/logout', (route) => respond(route, 503, problem(503, 'SERVICE_UNAVAILABLE'), 'problem'));
  await page.goto(`${path}/new`);
  await fillForm(page);
  await page.getByRole('button', { name: /Меню пользователя:/ }).click();
  await page.getByRole('menuitem', { name: 'Выйти' }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось выйти');
  await expect(page.getByRole('textbox', { name: 'Название' })).toHaveValue(` ${write.name} `);
  await expect(page.getByRole('textbox', { name: 'Правило 2' })).toHaveValue(write.checklist[1]!);
});

test('настройки загружают нужную площадку и отправляют полную конфигурацию с версией из ответа', async ({ page }) => {
  await session(page);
  const requests: AdminChannelUpdate[] = [];
  const { id, number, ...original } = inactive;
  const instruction = 'Пиши по-русски.\n  Укажи условия сделки.';
  const addedRule = 'Укажи цену.\nУточни валюту.';
  const canonicalRule = 'Укажи цену и валюту.';
  let resolve!: () => void;
  const hold = new Promise<void>((done) => { resolve = done; });
  await page.route(channelAPI, (route) => {
    expect(route.request().method()).toBe('GET');
    return respond(route, 200, { items: [active, inactive] }, 'list');
  });
  await page.route(`${channelAPI}/${id}`, async (route) => {
    expect(route.request().method()).toBe('PUT');
    const body = route.request().postDataJSON() as AdminChannelUpdate;
    assertContract('update', body);
    requests.push(body);
    if (requests.length === 1) await hold;
    const { expectedNumber, ...config } = body;
    return respond(route, 200, { ...config, checklist: [canonicalRule, original.checklist[0]], id, number: expectedNumber + 1 }, 'updated');
  });
  try {
    await page.setViewportSize({ width: 320, height: 820 });
    await page.goto(`${path}/${id.toUpperCase()}`);
    const prompt = page.getByRole('textbox', { name: 'Системный промпт' });
    const submit = page.getByRole('button', { name: 'Сохранить настройки' });
    await expect(page.getByRole('heading', { name: 'Настройки: ЦИАН' })).toBeVisible();
    await expect(page.getByText('Версия 1')).toBeVisible();
    await expect(prompt).toHaveValue(original.instruction);
    await expect(page.getByRole('textbox', { name: 'Название' })).toHaveValue(original.name);
    await expect(page.getByRole('textbox', { name: 'Максимум символов в тексте' })).toHaveValue('Не задано');
    await expect(page.getByText('Площадка выключена')).toBeVisible();
    await prompt.fill(instruction);
    await page.getByRole('button', { name: 'Удалить правило 2' }).click();
    await expect(page.getByRole('button', { name: 'Удалить правило 1' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Добавить правило' }).click();
    const second = page.getByRole('textbox', { name: 'Правило 2' });
    await expect(second).toBeFocused();
    await second.fill(addedRule);
    await page.getByRole('button', { name: 'Поднять правило 2' }).focus();
    await page.keyboard.press('Enter');
    const first = page.getByRole('textbox', { name: 'Правило 1' });
    await expect(first).toBeFocused();
    await expect(first).toHaveValue(addedRule);
    await expect(second).toHaveValue(original.checklist[0]!);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await submit.click();
    await expect(page.getByRole('button', { name: 'Сохраняем настройки…' })).toBeDisabled();
    await expect(prompt).toBeDisabled();
    await expect.poll(() => requests.length).toBe(1);
    resolve();
    await expect(page.getByText('Настройки сохранены')).toBeVisible();
    await expect(page.getByText('Версия 2')).toBeVisible();
    await expect(first).toHaveValue(canonicalRule);
    await prompt.fill('Уточни цену и условия сделки.');
    await submit.click();
    await expect(page.getByText('Версия 3')).toBeVisible();
    expect(requests).toEqual([
      { ...original, instruction, checklist: [addedRule, original.checklist[0]], expectedNumber: number },
      { ...original, instruction: 'Уточни цену и условия сделки.', checklist: [canonicalRule, original.checklist[0]], expectedNumber: number + 1 },
    ]);
  } finally {
    resolve();
  }
});

test('конфликт сохраняет ввод при отмене и ошибке загрузки, после замены остаётся копия правок', async ({ page }) => {
  await session(page);
  const { id, number, ...original } = active;
  const current = {
    ...original, name: 'Авито (продажа)', limits: { titleLimit: null, textLimit: 1000 }, isActive: false,
    instruction: 'Актуальный промпт.', checklist: ['Актуальное правило.'],
  };
  const draft = 'Новый промпт администратора.';
  const draftRule = 'Правило администратора.';
  const requests: AdminChannelUpdate[] = [];
  let reads = 0;
  await page.route(channelAPI, (route) => {
    reads++;
    if (reads <= 2) return respond(route, 200, { items: [active] }, 'list');
    if (reads === 3) return respond(route, 503, problem(503, 'SERVICE_UNAVAILABLE'), 'problem');
    return respond(route, 200, { items: [{ ...current, id, number: number + 1 }] }, 'list');
  });
  await page.route(`${channelAPI}/${id}`, (route) => {
    const body = route.request().postDataJSON() as AdminChannelUpdate;
    assertContract('update', body);
    requests.push(body);
    if (requests.length === 1) return respond(route, 409, { ...problem(409, 'CONFLICT'), currentVersion: number + 1 }, 'problem');
    return respond(route, 200, { ...current, instruction: body.instruction, id, number: number + 2 }, 'updated');
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
  await page.getByRole('link', { name: 'Настройки: Авито' }).click();
  const prompt = page.getByRole('textbox', { name: 'Системный промпт' });
  const rule = page.getByRole('textbox', { name: 'Правило 1' });
  const submit = page.getByRole('button', { name: 'Сохранить настройки' });
  const reload = page.getByRole('button', { name: 'Загрузить актуальную версию' });
  const dialog = page.getByRole('dialog', { name: 'Загрузить актуальную версию?' });
  await prompt.fill(draft);
  await rule.fill(draftRule);
  await submit.click();
  await expect(page.getByText('Настройки изменились')).toBeVisible();
  await expect(submit).toBeDisabled();
  await expect(prompt).toHaveValue(draft);
  await expect(rule).toHaveValue(draftRule);
  expect(reads).toBe(2);
  const navigationPrompts: string[] = [];
  page.on('dialog', async (warning) => {
    navigationPrompts.push(warning.type());
    await warning.dismiss();
  });
  await page.getByRole('button', { name: '← Площадки' }).click();
  await expect(page).toHaveURL(new RegExp(`${path}/${id}$`));
  await page.goBack();
  await expect.poll(() => navigationPrompts).toEqual(['confirm', 'confirm']);
  await expect(page).toHaveURL(new RegExp(`${path}/${id}$`));
  await expect(prompt).toHaveValue(draft);
  await expect(rule).toHaveValue(draftRule);
  await reload.click();
  const close = dialog.getByRole('button', { name: 'Закрыть подтверждение' });
  await expect(close).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await close.click();
  await expect(dialog).toHaveCount(0);
  await expect(prompt).toHaveValue(draft);
  expect(reads).toBe(2);
  await reload.click();
  await dialog.getByRole('button', { name: 'Загрузить и заменить форму' }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить актуальную версию');
  await expect(prompt).toHaveValue(draft);
  await expect(rule).toHaveValue(draftRule);
  await reload.press('Enter');
  await dialog.getByRole('button', { name: 'Загрузить и заменить форму' }).press('Enter');
  await expect(prompt).toHaveValue(current.instruction);
  await expect(rule).toHaveValue(current.checklist[0]!);
  const updatedHeading = page.getByRole('heading', { name: 'Настройки: Авито (продажа)' });
  await expect(updatedHeading).toBeFocused();
  await page.getByRole('button', { name: 'Открыть сохранённые правки' }).click();
  const copy = page.getByRole('dialog', { name: 'Мои правки' });
  await expect(copy.getByRole('textbox', { name: 'Сохранённый ввод' })).toHaveValue(new RegExp(`${draft}.*${draftRule}`, 's'));
  await expect(copy.getByRole('button', { name: 'Закрыть копию правок' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await copy.getByRole('button', { name: 'Вернуться к форме' }).click();
  await prompt.fill(draft);
  await submit.click();
  await expect(page.getByText('Настройки сохранены')).toBeVisible();
  expect(requests).toEqual([
    { ...original, instruction: draft, checklist: [draftRule, original.checklist[1]], expectedNumber: number },
    { ...current, instruction: draft, expectedNumber: number + 1 },
  ]);
});

test('повторные конфликты сохраняют разные черновики и не копируют неизменённые настройки', async ({ page }) => {
  await session(page);
  let current = active;
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  await page.route(channelAPI, async (route) => {
    if (current.number === active.number + 2) await hold;
    return respond(route, 200, { items: [current] }, 'list');
  });
  await page.route(`${channelAPI}/${active.id}`, (route) => {
    const body = route.request().postDataJSON() as AdminChannelUpdate;
    assertContract('update', body);
    expect(body.expectedNumber).toBe(current.number);
    const number = current.number + 1;
    current = { ...current, number, instruction: `Промпт сервера для версии ${number}` };
    return respond(route, 409, { ...problem(409, 'CONFLICT'), currentVersion: number }, 'problem');
  });
  await page.goto(`${path}/${active.id}`);
  const prompt = page.getByRole('textbox', { name: 'Системный промпт' });
  const submit = page.getByRole('button', { name: 'Сохранить настройки' });
  const savedCopies = page.getByRole('button', { name: 'Открыть сохранённые правки' });
  try {
    for (const rules of [['Проверить цену\n2. Проверить фото'], null, ['Проверить цену', 'Проверить фото']]) {
      if (rules) {
        await prompt.fill('Промпт администратора');
        if (rules.length === 1) await page.getByRole('button', { name: 'Удалить правило 2' }).click();
        for (const [index, text] of rules.entries()) await page.getByRole('textbox', { name: `Правило ${index + 1}` }).fill(text);
      }
      await submit.click();
      await page.getByRole('button', { name: 'Загрузить актуальную версию' }).click();
      await page.getByRole('button', { name: 'Загрузить и заменить форму' }).click();
      if (!rules) {
        await expect(savedCopies).toBeDisabled();
        release();
      }
      await expect(prompt).toHaveValue(current.instruction);
    }
    await savedCopies.click();
    const copy = page.getByRole('textbox', { name: 'Сохранённый ввод' });
    await expect(copy).toHaveValue(/Правки к версии 2[\s\S]*1\. Проверить цену\n {3}2\. Проверить фото[\s\S]*Правки к версии 4[\s\S]*1\. Проверить цену\n2\. Проверить фото/);
    await expect(copy).not.toHaveValue(/Промпт сервера для версии 3/);
  } finally {
    release();
  }
});

test('Back при перепроверке роли после PUT 403 оставляет черновик в настройках', async ({ page }) => {
  let sessionChecks = 0;
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/v1/auth/me', async (route) => {
    if (++sessionChecks > 1) await hold;
    return route.fulfill({ json: { user } });
  });
  await page.route(channelAPI, (route) => respond(route, 200, { items: [active] }, 'list'));
  await page.route(`${channelAPI}/${active.id}`, (route) => {
    assertContract('update', route.request().postDataJSON());
    return respond(route, 403, problem(403, 'FORBIDDEN'), 'problem');
  });
  try {
    await page.goto(path);
    await page.getByRole('link', { name: 'Настройки: Авито' }).click();
    const prompt = page.getByRole('textbox', { name: 'Системный промпт' });
    const rule = page.getByRole('textbox', { name: 'Правило 1' });
    await prompt.fill('Новый промпт');
    await rule.fill('Новое правило');
    await page.getByRole('button', { name: 'Сохранить настройки' }).click();
    await expect(page.getByText('Проверяем сессию')).toBeVisible();
    await expect(prompt).toHaveCount(0);
    const navigationPrompts: string[] = [];
    page.on('dialog', async (warning) => {
      navigationPrompts.push(warning.type());
      await warning.dismiss();
    });
    await page.goBack();
    await expect.poll(() => navigationPrompts).toEqual(['confirm']);
    await expect(page).toHaveURL(new RegExp(`${path}/${active.id}$`));
    release();
    await expect(prompt).toHaveValue('Новый промпт');
    await expect(rule).toHaveValue('Новое правило');
    await expect(page.getByRole('alert')).toContainText('Не удалось сохранить настройки');
  } finally {
    release();
  }
});

test('редактор показывает ошибки полей и оставляет ввод после сбоя сохранения', async ({ page }) => {
  await session(page);
  let writes = 0;
  await page.route(channelAPI, (route) => respond(route, 200, { items: [active] }, 'list'));
  await page.route(`${channelAPI}/${active.id}`, (route) => {
    const body = route.request().postDataJSON() as AdminChannelUpdate;
    assertContract('update', body);
    if (++writes === 1) return respond(route, 422, {
      ...problem(422, 'VALIDATION_FAILED'),
      fieldErrors: [{ field: '/checklist/1', code: 'VALIDATION_FAILED', message: 'Уточните второе правило' }],
    }, 'problem');
    if (writes === 2) return respond(route, 422, {
      ...problem(422, 'VALIDATION_FAILED'), title: 'Системный промпт слишком длинный',
    }, 'problem');
    if (writes === 3) return respond(route, 503, problem(503, 'SERVICE_UNAVAILABLE'), 'problem');
    const { expectedNumber, ...config } = body;
    return respond(route, 200, { ...config, id: active.id, number: expectedNumber + 1 }, 'updated');
  });
  await page.goto(`${path}/${active.id}`);
  const prompt = page.getByRole('textbox', { name: 'Системный промпт' });
  const rule = page.getByRole('textbox', { name: 'Правило 2' });
  const submit = page.getByRole('button', { name: 'Сохранить настройки' });
  await prompt.fill(' ');
  await rule.fill('');
  await submit.click();
  await expect(prompt).toHaveAccessibleDescription('Введите системный промпт');
  await expect(prompt).toBeFocused();
  await expect(rule).toHaveAccessibleDescription('Введите текст правила');
  expect(writes).toBe(0);
  await prompt.fill('Новый промпт.');
  await rule.fill('Новое правило.');
  await submit.click();
  await expect(rule).toHaveAccessibleDescription('Уточните второе правило');
  await expect(rule).toBeFocused();
  await rule.fill('Уточнённое правило.');
  await submit.click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Системный промпт слишком длинный');
  await prompt.fill('Короткий промпт.');
  await submit.click();
  await expect(alert).toContainText('Не удалось сохранить настройки');
  await expect(prompt).toHaveValue('Короткий промпт.');
  await expect(rule).toHaveValue('Уточнённое правило.');
  await alert.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByText('Настройки сохранены')).toBeVisible();
  expect(writes).toBe(4);
});

test('загрузка настроек показывает ошибку, повтор и отсутствие площадки', async ({ page }) => {
  await session(page);
  let resolve!: () => void;
  const hold = new Promise<void>((done) => { resolve = done; });
  let attempts = 0;
  await page.route(channelAPI, async (route) => {
    if (++attempts === 1) {
      await hold;
      return respond(route, 503, problem(503, 'SERVICE_UNAVAILABLE'), 'problem');
    }
    return respond(route, 200, { items: [active] }, 'list');
  });
  try {
    await page.goto(`${path}/${inactive.id}`);
    await expect(page.getByText('Загружаем настройки')).toBeVisible();
    resolve();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Не удалось загрузить настройки');
    await alert.getByRole('button', { name: 'Повторить' }).click();
    await expect(page.getByText('Площадка не найдена')).toBeVisible();
    await expect(page.getByRole('form', { name: 'Настройки площадки' })).toHaveCount(0);
    await page.getByRole('button', { name: '← Площадки' }).click();
    await expect(page.getByRole('list', { name: 'Список площадок' })).toBeVisible();
  } finally {
    resolve();
  }
});
