import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';

const directory = new URL('../../node_modules/.cache/ui-fixture/', import.meta.url);
const contentTypes: Record<string, string> = { js: 'text/javascript', css: 'text/css', woff2: 'font/woff2', html: 'text/html' };
const user = { id: '9a07b31d-ac15-495c-bb91-e3756fe40bcc', login: 'agent_demo', role: 'agent' };

export async function startSessionServer() {
  const calls: { path: string; method: string; body: unknown; cookie: string | undefined; origin: string | undefined }[] = [];
  const controls = { failLogin: false, failLogout: false, role: 'agent' as 'agent' | 'admin' };
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
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const rawBody = Buffer.concat(chunks).toString();
    calls.push({ path, method: request.method!, body: rawBody ? JSON.parse(rawBody) : null, cookie: request.headers.cookie, origin: request.headers.origin });
    let status = 200;
    let body: unknown = { user: { ...user, role: controls.role } };
    const fail = (statusCode: number, code: string) => {
      status = statusCode;
      body = { type: 'about:blank', title: code === 'INVALID_CREDENTIALS' ? 'Неверный логин или пароль' : 'Не удалось выполнить запрос',
        status, code, requestId: 'a6cdd08a-a252-48fa-a6c5-73f485bc494e' };
    };
    if (path === '/api/v1/auth/me' && request.method === 'GET') {
      if (!request.headers.cookie?.includes('session=test-session')) fail(401, 'UNAUTHENTICATED');
    } else if (path === '/api/v1/auth/logout' && request.method === 'POST') {
      if (controls.failLogout) fail(503, 'SERVICE_UNAVAILABLE');
      else {
        status = 204; body = undefined;
        response.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Lax; Path=/api/v1; Max-Age=0');
      }
    } else if ((path === '/api/v1/auth/login' || path === '/api/v1/auth/register') && request.method === 'POST') {
      if (path.endsWith('/login') && controls.failLogin) fail(401, 'INVALID_CREDENTIALS');
      else {
        status = path.endsWith('/register') ? 201 : 200;
        response.setHeader('Set-Cookie', 'session=test-session; HttpOnly; SameSite=Lax; Path=/api/v1');
      }
    } else fail(404, 'NOT_FOUND');
    response.writeHead(status, { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json', 'Cache-Control': 'no-store' });
    response.end(body === undefined ? undefined : JSON.stringify(body));
  });
  server.listen(0, '127.0.0.1');
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
