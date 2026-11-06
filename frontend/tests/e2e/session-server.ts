import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { once } from 'node:events';

import type { ListingData } from '../../src/shared/api/listing-data';
import type { ListingSummary, Photo } from '../../src/shared/api/types';
import { listingDetails } from '../fixtures/listings.ts';

const directory = new URL('../../node_modules/.cache/ui-fixture/', import.meta.url);
const application = new URL('../../dist/', import.meta.url);
const contentTypes: Record<string, string> = { js: 'text/javascript', css: 'text/css', woff2: 'font/woff2', html: 'text/html', json: 'application/json', jpg: 'image/jpeg' };
const user = { id: '9a07b31d-ac15-495c-bb91-e3756fe40bcc', login: 'agent_demo', role: 'agent' };

export async function startSessionServer(host = '127.0.0.1', port = 0) {
  const calls: { query: string; path: string; method: string; body: unknown; contentType: string | undefined; cookie: string | undefined; origin: string | undefined }[] = [];
  const controls = {
    photoError: null as number | 'network' | 'invalid' | 'disconnect-after-write' | null,
    photoErrorCode: 'VERSION_CONFLICT',
    photoCompletion: null as 'ready' | 'failed' | null,
    photoImageError: false,
    holdUpload: undefined as Promise<void> | undefined,
    holdDelete: undefined as Promise<void> | undefined,
    holdDetail: undefined as Promise<void> | undefined,
    updateError: null as number | 'network' | 'invalid' | 'broken-json' | 'disconnect-after-write' | null,
    updateErrorCode: 'VERSION_CONFLICT',
    updateFields: ['/data/deal/price'] as string[],
    updateResponse: undefined as unknown,
    holdUpdate: undefined as Promise<void> | undefined,
    createError: null as number | 'network' | 'invalid' | 'wrong-status' | 'broken-json' | null,
    createFields: ['/data/deal/price'] as string[],
    createResponse: undefined as unknown,
    holdCreate: undefined as Promise<void> | undefined,
    listingDataset: null as ListingSummary[] | null,
    listingPageSize: 20,
    listingPages: [{ items: [], nextCursor: null }] as unknown[],
    listingError: null as number | 'network' | 'invalid' | null,
    holdListings: undefined as Promise<void> | undefined,
    detail: listingDetails() as unknown,
    details: new Map<string, unknown>(),
    detailError: null as number | null,
    userId: user.id,
    failLogin: false, failLogout: false, role: 'agent' as 'agent' | 'admin',
    loginError: null as number | 'network' | 'invalid' | null,
    registerError: null as number | 'network' | 'invalid' | 'broken-json' | 'wrong-status' | null,
    registerFields: ['/login'] as string[],
    retryAfter: '30' as string | null,
    meError: null as number | null,
    holdLogin: undefined as Promise<void> | undefined,
    holdRegister: undefined as Promise<void> | undefined,
    holdMe: undefined as Promise<void> | undefined,
  };
  const server = createServer(async (request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname;
    if (path.startsWith('/__ui/')) {
      const file = new URL(path.slice('/__ui/'.length), directory);
      if (!file.href.startsWith(directory.href)) { response.writeHead(404).end(); return; }
      try {
        response.setHeader('Content-Type', contentTypes[path.split('.').at(-1) ?? ''] ?? 'application/octet-stream');
        response.end(await readFile(file));
      } catch { response.writeHead(404).end(); }
      return;
    }
    if (!path.startsWith('/api/')) {
      const target = (['/', '/login', '/register', '/app', '/app/new'].includes(path) || path.startsWith('/app/listings/')) ? 'index.html' : path === '/docs/' ? 'docs/index.html' : path.slice(1);
      const file = new URL(target, application);
      if (!file.href.startsWith(application.href)) { response.writeHead(404).end(); return; }
      try {
        response.setHeader('Content-Type', contentTypes[target.split('.').at(-1) ?? ''] ?? 'application/octet-stream');
        response.end(await readFile(file));
      } catch { response.writeHead(404).end(); }
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const rawBody = bytes.toString();
    let parsedBody: unknown;
    let uploadedFile: File | undefined;
    let expectedVersion: number | undefined;
    if (request.headers['content-type']?.startsWith('multipart/form-data;')) {
      const form = await new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': request.headers['content-type'] }, body: bytes }).formData();
      const file = form.get('file');
      if (file instanceof File) uploadedFile = file;
      expectedVersion = Number(form.get('expectedVersion'));
      parsedBody = { expectedVersion, file: uploadedFile ? { name: uploadedFile.name, type: uploadedFile.type, size: uploadedFile.size, bytes: Buffer.from(await uploadedFile.arrayBuffer()).toString('base64') } : null };
    } else parsedBody = rawBody ? JSON.parse(rawBody) : null;
    calls.push({ query: new URL(request.url!, 'http://localhost').search, path, method: request.method!, body: parsedBody, contentType: request.headers['content-type'], cookie: request.headers.cookie, origin: request.headers.origin });
    let status = 200;
    let body: unknown = { user: { ...user, id: controls.userId, role: controls.role } };
    const fail = (statusCode: number, code: string) => {
      status = statusCode;
      body = { type: 'about:blank', title: code === 'INVALID_CREDENTIALS' ? 'Неверный логин или пароль' : 'Не удалось выполнить запрос',
        status, code, requestId: 'a6cdd08a-a252-48fa-a6c5-73f485bc494e' };
    };
    const photoPath = /^\/api\/v1\/listings\/([^/]+)\/photos(?:\/([^/]+)(?:\/(content|thumbnail))?)?$/.exec(path);
    if (photoPath) {
      const id = photoPath[1]!;
      const detail = (controls.details.get(id) ?? controls.detail) as { id: string; photos: Photo[]; version: number; status: string; updatedAt: string };
      if (!request.headers.cookie?.includes('session=test-session')) fail(401, 'UNAUTHENTICATED');
      else if (request.method === 'GET' && photoPath[3]) {
        const photo = detail.photos.find((entry) => entry.id === photoPath[2]);
        if (!photo || controls.photoImageError) fail(404, 'NOT_FOUND');
        else {
          response.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store' });
          response.end(await readFile(new URL('../../src/pages/home/assets/living-room.jpg', import.meta.url))); return;
        }
      } else {
        await (request.method === 'POST' ? controls.holdUpload : controls.holdDelete);
        const disconnect = () => {
          response.writeHead(request.method === 'POST' ? 201 : 200, { 'Content-Type': 'application/json', 'Content-Length': '1000' });
          response.write('{"version":'); setTimeout(() => response.destroy(), 25);
        };
        if (controls.photoError === 'network') { disconnect(); return; }
        const version = request.method === 'POST' ? expectedVersion : Number(new URL(request.url!, 'http://localhost').searchParams.get('expectedVersion'));
        if (typeof controls.photoError === 'number') fail(controls.photoError, controls.photoErrorCode);
        else if (detail.status === 'generating') fail(409, 'LISTING_BUSY');
        else if (version !== detail.version) fail(409, 'VERSION_CONFLICT');
        else if (request.method === 'POST') {
          if (!uploadedFile || detail.photos.length >= 20 || !['image/jpeg', 'image/png'].includes(uploadedFile.type) || uploadedFile.size < 1 || uploadedFile.size > 15000000) fail(422, 'INVALID_PHOTO');
          else {
            const photoId = `70792597-4a2a-4ddb-9d00-${String(100 + calls.filter((call) => call.method === 'POST' && call.path === path).length).padStart(12, '0')}`;
            const photo: Photo = { id: photoId, listingId: id, fileName: uploadedFile.name, mimeType: uploadedFile.type as Photo['mimeType'], sizeBytes: uploadedFile.size,
              status: 'processing', contentUrl: `/api/v1/listings/${id}/photos/${photoId}/content`, thumbnailUrl: null, error: null };
            detail.photos.push(photo); detail.version++; detail.status = 'draft'; detail.updatedAt = '2026-11-06T12:00:00Z'; status = 201;
            body = { version: detail.version, photo };
          }
        } else if (request.method === 'DELETE') {
          const index = detail.photos.findIndex((photo) => photo.id === photoPath[2]);
          if (index < 0) fail(404, 'NOT_FOUND');
          else { detail.photos.splice(index, 1); detail.version++; detail.status = 'draft'; detail.updatedAt = '2026-11-06T12:00:00Z'; body = { version: detail.version }; }
        } else fail(404, 'NOT_FOUND');
        if (controls.photoError === 'invalid') body = { invalid: true };
        if (controls.photoError === 'disconnect-after-write') { disconnect(); return; }
      }
    } else if (/^\/api\/v1\/listings\/[^/]+$/.test(path) && request.method === 'PUT') {
      await controls.holdUpdate;
      const disconnect = () => {
        response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '1000' });
        response.write('{"id":'); setTimeout(() => response.destroy(), 25);
      };
      if (controls.updateError === 'network') { disconnect(); return; }
      if (controls.updateError === 'broken-json') { response.writeHead(200, { 'Content-Type': 'application/json' }).end('{'); return; }
      const id = path.split('/').at(-1)!;
      const detail = (controls.details.get(id) ?? controls.detail) as { id: string; version: number; status: string; data: ListingData; generationError: unknown; updatedAt: string };
      const input = parsedBody as { data: ListingData; expectedVersion: number };
      if (!request.headers.cookie?.includes('session=test-session')) fail(401, 'UNAUTHENTICATED');
      else if (typeof controls.updateError === 'number') {
        fail(controls.updateError, controls.updateError === 409 ? controls.updateErrorCode : 'VALIDATION_ERROR');
        if (controls.updateError === 400 || controls.updateError === 422) body = { ...(body as object), fieldErrors: controls.updateFields.map((field) => ({ field, code: 'INVALID', message: 'Technical diagnostic must stay hidden' })) };
      } else if (input.expectedVersion !== detail.version) fail(409, 'VERSION_CONFLICT');
      else if (detail.status === 'generating') fail(409, 'LISTING_BUSY');
      else {
        if (!isDeepStrictEqual(input.data, detail.data)) {
          detail.data = input.data; detail.version++; detail.status = 'draft'; detail.generationError = null; detail.updatedAt = '2026-11-06T12:30:00Z';
        }
        controls.details.set(id, detail);
        body = controls.updateResponse ?? detail;
        if (controls.updateError === 'invalid') body = { unexpected: true };
        if (controls.updateError === 'disconnect-after-write') { disconnect(); return; }
      }
    } else if (path === '/api/v1/listings' && request.method === 'POST') {
      await controls.holdCreate;
      if (controls.createError === 'network') {
        response.writeHead(201, { 'Content-Type': 'application/json', 'Content-Length': '1000' });
        response.write('{"id":'); setTimeout(() => response.destroy(), 25); return;
      }
      if (controls.createError === 'broken-json') { response.writeHead(201, { 'Content-Type': 'application/json' }).end('{'); return; }
      if (typeof controls.createError === 'number') {
        fail(controls.createError, 'VALIDATION_ERROR');
        body = { ...(body as object), fieldErrors: controls.createFields.map((field) => ({ field, code: 'INVALID', message: 'Technical diagnostic must stay hidden' })) };
      } else {
        const data = (JSON.parse(rawBody) as { data: ListingData }).data;
        const id = '70792597-4a2a-4ddb-9d00-c2340dd8c016';
        body = controls.createResponse ?? { id, version: 1, status: 'draft', data, photos: [], result: null, generationError: null, createdAt: '2026-11-05T10:00:00Z', updatedAt: '2026-11-05T10:00:00Z' };
        controls.details.set(id, body);
        status = controls.createError === 'wrong-status' ? 200 : 201;
        if (controls.createError === 'invalid') body = { unexpected: true };
      }
    } else if (path === '/api/v1/listings' && request.method === 'GET') {
      const index = calls.filter((call) => call.path === path && call.method === 'GET').length - 1;
      const params = new URL(request.url!, 'http://localhost').searchParams;
      let result = controls.listingPages[Math.min(index, controls.listingPages.length - 1)];
      if (controls.listingDataset) {
        const q = (params.get('q') ?? '').toLocaleLowerCase('ru');
        const from = params.get('from'); const to = params.get('to');
        const items = controls.listingDataset.filter((item) => (!q || item.address?.toLocaleLowerCase('ru').includes(q))
          && (!from || Date.parse(item.createdAt) >= Date.parse(from)) && (!to || Date.parse(item.createdAt) < Date.parse(to)));
        const offset = Number(params.get('cursor') ?? 0);
        const limit = Math.min(Number(params.get('limit') ?? 20), controls.listingPageSize);
        result = { items: items.slice(offset, offset + limit), nextCursor: offset + limit < items.length ? String(offset + limit) : null };
      }
      await controls.holdListings;
      if (controls.listingError === 'network') { response.destroy(); return; }
      if (typeof controls.listingError === 'number') fail(controls.listingError, 'SERVICE_UNAVAILABLE');
      else body = controls.listingError === 'invalid' ? { items: 'wrong' } : result;
    } else if (path.startsWith('/api/v1/listings/') && request.method === 'GET') {
      const detail = structuredClone(controls.details.get(path.split('/').at(-1)!) ?? controls.detail) as { photos: Photo[] };
      if (controls.photoCompletion) {
        detail.photos.forEach((photo) => {
          if (photo.status !== 'processing') return;
          photo.status = controls.photoCompletion!;
          photo.thumbnailUrl = photo.status === 'ready' ? `/api/v1/listings/${photo.listingId}/photos/${photo.id}/thumbnail` : null;
          photo.error = photo.status === 'failed' ? { type: 'about:blank', title: 'Обработка не удалась', status: 422, code: 'PHOTO_PROCESSING_FAILED', requestId: 'a6cdd08a-a252-48fa-a6c5-73f485bc494e' } : null;
        });
        controls.details.set(path.split('/').at(-1)!, detail);
      }
      await controls.holdDetail;
      if (controls.detailError) fail(controls.detailError, 'NOT_FOUND');
      else body = detail;
    } else if (path === '/api/v1/auth/me' && request.method === 'GET') {
      await controls.holdMe;
      if (controls.meError) fail(controls.meError, 'SERVICE_UNAVAILABLE');
      else if (!request.headers.cookie?.includes('session=test-session')) fail(401, 'UNAUTHENTICATED');
    } else if (path === '/api/v1/auth/logout' && request.method === 'POST') {
      if (controls.failLogout) fail(503, 'SERVICE_UNAVAILABLE');
      else {
        status = 204; body = undefined;
        response.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Lax; Path=/api/v1; Max-Age=0');
      }
    } else if ((path === '/api/v1/auth/login' || path === '/api/v1/auth/register') && request.method === 'POST') {
      const registration = path.endsWith('/register');
      await (registration ? controls.holdRegister : controls.holdLogin);
      const error = registration ? controls.registerError : controls.loginError;
      if (error === 'network') {
        response.writeHead(registration ? 201 : 200, { 'Content-Type': 'application/json', 'Content-Length': '1000' });
        response.write('{"user":');
        setTimeout(() => response.destroy(), 25);
        return;
      }
      if (error === 'broken-json') {
        response.writeHead(201, { 'Content-Type': 'application/json' }).end('{');
        return;
      }
      if (error === 'invalid') { status = registration ? 201 : 200; body = { unexpected: true }; }
      else if (error === 'wrong-status') status = 200;
      else if (typeof error === 'number') {
        fail(error, error === 401 ? 'INVALID_CREDENTIALS' : error === 409 ? 'CONFLICT' : 'VALIDATION_ERROR');
        if (error === 429 && controls.retryAfter !== null) response.setHeader('Retry-After', controls.retryAfter);
        if (error === 400 || error === 422) body = { ...(body as object), fieldErrors: (registration ? controls.registerFields : ['/login']).map((field) => ({ field, code: 'INVALID', message: 'Technical diagnostic must stay hidden' })) };
      }
      else if (path.endsWith('/login') && controls.failLogin) fail(401, 'INVALID_CREDENTIALS');
      else {
        status = path.endsWith('/register') ? 201 : 200;
        response.setHeader('Set-Cookie', 'session=test-session; HttpOnly; SameSite=Lax; Path=/api/v1');
      }
    } else fail(404, 'NOT_FOUND');
    response.writeHead(status, { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json', 'Cache-Control': 'no-store' });
    response.end(body === undefined ? undefined : JSON.stringify(body));
  });
  server.listen(port, host);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Не удалось запустить тестовый сервер');
  return {
    calls, controls, url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => { if (error) reject(error); else resolve(); });
      server.closeAllConnections();
    }),
  };
}
