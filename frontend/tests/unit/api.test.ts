import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { account } from '../../src/shared/api/account';
import { request } from '../../src/shared/api/client';
import { RequestError } from '../../src/shared/api/errors';

const contract = JSON.parse(readFileSync(new URL('../../public/docs/openapi.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: false });
addFormats(ajv);
ajv.addSchema({ ...contract, $id: 'api' });
const validate = (schema: string, value: unknown) => expect(ajv.validate({ $ref: `api#/components/schemas/${schema}` }, value)).toBe(true);
const user = { id: '9a07b31d-ac15-495c-bb91-e3756fe40bcc', login: 'agent_demo', role: 'agent' };
const session = { user };
const problem = {
  type: 'about:blank', title: 'Проверьте поля', status: 422, code: 'VALIDATION_FAILED',
  requestId: 'a6cdd08a-a252-48fa-a6c5-73f485bc494e', detail: 'Укажите адрес', currentVersion: 3,
  fieldErrors: [{ code: 'REQUIRED', field: '/location/address', message: 'Укажите адрес' }],
};
const fetchMock = vi.fn<typeof fetch>();
const json = (value: unknown, status = 200, headers?: Record<string, string>) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', ...headers },
});

beforeEach(() => { vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset(); });

describe('HTTP-контракт аккаунта', () => {
  test.each([
    ['me', '/auth/me', 'GET', 200, undefined],
    ['login', '/auth/login', 'POST', 200, { login: 'a', password: ' x ' }],
    ['register', '/auth/register', 'POST', 201, { login: 'agent_demo', password: '  длинный пароль  ' }],
    ['logout', '/auth/logout', 'POST', 204, undefined],
  ] as const)('%s использует контракт, cookie и исходный пароль', async (method, path, verb, status, body) => {
    const operation = contract.paths[path][verb.toLowerCase()];
    expect(operation.responses[status]).toBeDefined();
    fetchMock.mockResolvedValue(status === 204 ? new Response(null, { status }) : json(session, status));
    const controller = new AbortController();
    const result = body ? await account[method as 'login' | 'register'](body, controller.signal)
      : await account[method as 'me' | 'logout'](controller.signal);
    expect(result).toEqual(status === 204 ? undefined : session);
    if (status !== 204) validate('Session', result);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${contract.servers[0].url}${path}`);
    expect(init).toMatchObject({ method: verb, credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store', signal: controller.signal });
    const headers = new Headers(init?.headers);
    expect(headers.has('Origin')).toBe(false);
    expect(headers.has('Authorization')).toBe(false);
    expect(headers.has('Cookie')).toBe(false);
    expect(init?.body).toBe(body ? JSON.stringify(body) : undefined);
    expect(headers.get('Content-Type')).toBe(body ? 'application/json' : null);
    if (body) validate(method === 'login' ? 'LoginRequest' : 'Credentials', JSON.parse(String(init?.body)));
  });

  test('204 не читает тело', async () => {
    const response = new Response(null, { status: 204 });
    const read = vi.spyOn(response, 'json');
    fetchMock.mockResolvedValue(response);
    await account.logout();
    expect(read).not.toHaveBeenCalled();
  });

  test('параметры запроса кодируются, отсутствующие пропускаются', async () => {
    fetchMock.mockResolvedValue(json(session));
    await request('/listings', { status: 200, response: (value) => value, query: { search: 'дом & сад', page: 2, active: false, absent: undefined } });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/listings?search=%D0%B4%D0%BE%D0%BC+%26+%D1%81%D0%B0%D0%B4&page=2&active=false');
  });

  test('FormData сохраняет boundary браузера', async () => {
    const body = new FormData();
    body.set('file', new Blob(['photo'], { type: 'image/png' }), 'photo.png');
    fetchMock.mockResolvedValue(json({ id: 'photo' }, 201));
    await request('/listings/id/photos', { method: 'POST', body, status: 201, response: (value) => value });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.body).toBe(body);
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
  });

  test.each(['https://example.org/auth/login', '//example.org/auth/login', '/../../auth', '/%2e%2e/auth', '/auth\\login', '/auth/me?next=secret', '/auth/me#secret'])('отклоняет внешний или неоднозначный адрес %s до fetch', async (path) => {
    await expect(request(path, { status: 200, response: (value) => value })).rejects.toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('единые ошибки', () => {
  test('сохраняет предусмотренные Problem поля без сырого ответа и запроса', async () => {
    validate('Problem', problem);
    fetchMock.mockResolvedValue(json({ ...problem, password: 'secret', stack: 'private', fieldErrors: problem.fieldErrors.map((field) => ({ ...field, password: 'secret' })) }, 422, { 'Content-Type': 'application/problem+json; charset=utf-8' }));
    const error = await account.register({ login: 'agent_demo', password: 'secret' }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(RequestError);
    expect(error).toMatchObject({ kind: 'http', status: 422, code: problem.code, message: problem.title, requestId: problem.requestId, fieldErrors: problem.fieldErrors, problem });
    expect(JSON.stringify(error)).not.toMatch(/secret|private|password|stack/);
  });

  test.each([500, 501, 503])('ошибка сервера %s получает безопасное сообщение', async (status) => {
    fetchMock.mockResolvedValue(json({ ...problem, status, title: 'Internal stack trace' }, status, { 'Content-Type': 'application/problem+json' }));
    await expect(account.me()).rejects.toMatchObject({ kind: 'http', status, message: 'Сервис временно недоступен. Попробуйте позже.' });
  });

  test.each([undefined, '', '0', '-1', '1.5', 'tomorrow', 'Wed, 21 Oct 2026 07:28:00 GMT', '9007199254740992', '30'])('Retry-After %s не выдумывает ожидание', async (value) => {
    fetchMock.mockResolvedValue(json({ ...problem, status: 429 }, 429, { 'Content-Type': 'application/problem+json', ...(value !== undefined ? { 'Retry-After': value } : {}) }));
    await expect(account.login({ login: 'a', password: 'a' })).rejects.toMatchObject({ status: 429, retryAfterSeconds: value === '30' ? 30 : undefined });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('POST при сетевом сбое выполняется один раз и не сохраняет причину с паролем', async () => {
    fetchMock.mockRejectedValue(new TypeError('password=secret'));
    const error = await account.login({ login: 'a', password: 'secret' }).catch((error: unknown) => error);
    expect(error).toMatchObject({ kind: 'network' });
    expect(String(error)).not.toContain('secret');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('AbortSignal отменяет запрос, включая произвольную причину abort', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    }));
    const result = account.me(controller.signal);
    controller.abort('остановка');
    await expect(result).rejects.toMatchObject({ kind: 'aborted' });
  });

  test('AbortError распознаётся без переданного сигнала', async () => {
    fetchMock.mockRejectedValue(new DOMException('abort', 'AbortError'));
    await expect(account.me()).rejects.toMatchObject({ kind: 'aborted' });
  });

  test.each([
    new Response('<html>private error</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    new Response('{', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    json(null), json({ user: { ...user, role: 'owner' } }), json({ user: { ...user, id: 'invalid' } }),
    json(session, 201), new Response(null, { status: 204 }),
  ])('некорректный успешный ответ не становится сессией %#', async (response) => {
    fetchMock.mockResolvedValue(response);
    await expect(account.me()).rejects.toMatchObject({ kind: 'invalid-response', status: response.status });
  });

  test.each([
    new Response('<html>private error</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }),
    new Response('{', { status: 422, headers: { 'Content-Type': 'application/problem+json' } }),
    json({ ...problem, status: 401 }, 422, { 'Content-Type': 'application/problem+json' }),
    json({ ...problem, fieldErrors: ['private'] }, 422, { 'Content-Type': 'application/problem+json' }),
    json({ ...problem, currentVersion: 0 }, 422, { 'Content-Type': 'application/problem+json' }),
    json({ ...problem, detail: {} }, 422, { 'Content-Type': 'application/problem+json' }),
  ])('неизвестная ошибка сохраняет HTTP-статус и безопасный fallback %#', async (response) => {
    fetchMock.mockResolvedValue(response);
    const error = await account.me().catch((error: unknown) => error);
    expect(error).toMatchObject({ kind: 'http', status: response.status, problem: undefined });
    expect(String(error)).not.toContain('private');
  });

  test.each([true, false])('отмена во время чтения тела (HTTP-ошибка: %s)', async (failed) => {
    const response = json({}, failed ? 422 : 200, { 'Content-Type': failed ? 'application/problem+json' : 'application/json' });
    vi.spyOn(response, 'json').mockRejectedValue(new DOMException('abort', 'AbortError'));
    fetchMock.mockResolvedValue(response);
    await expect(account.me()).rejects.toMatchObject({ kind: 'aborted' });
  });
});
