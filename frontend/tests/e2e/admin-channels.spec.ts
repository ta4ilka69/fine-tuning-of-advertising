import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Page, Route } from '@playwright/test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { AdminChannel, AdminChannelWrite } from '../../src/shared/api/admin-channels';
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
const validators = {
  list: ajv.compile({ $ref: `${contractId}${channelOperation}/get/responses/200/content/application~1json/schema` }),
  write: ajv.compile({ $ref: `${contractId}${channelOperation}/post/requestBody/content/application~1json/schema` }),
  created: ajv.compile({ $ref: `${contractId}${channelOperation}/post/responses/201/content/application~1json/schema` }),
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
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await list.getByRole('link', { name: `Настройки: ${inactive.name}` }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${path}/${inactive.id}$`));
    await expect(page.getByRole('heading', { name: 'Настройки площадки' })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Настройки площадки' })).toBeVisible();
  expect(calls).toEqual([write]);
});

test('ошибки 422 и 409 отмечают нужные поля, сохраняют форму и позволяют повторить POST', async ({ page }) => {
  await session(page);
  const calls: AdminChannelWrite[] = [];
  await page.route(channelAPI, (route) => {
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
