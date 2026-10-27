import { request } from './client';
import { isRecord } from './errors';
import type { LoginRequest, RegisterRequest, Session } from './types';

function parseSession(value: unknown): Session {
  if (!isRecord(value) || !isRecord(value.user)
    || typeof value.user.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.user.id)
    || typeof value.user.login !== 'string' || !/\S/.test(value.user.login)
    || (value.user.role !== 'agent' && value.user.role !== 'admin')) {
    throw new TypeError('Некорректная сессия');
  }
  return { user: { id: value.user.id, login: value.user.login, role: value.user.role } };
}

export const account = {
  me: (signal?: AbortSignal) => request('/auth/me', { signal, status: 200, response: parseSession }),
  login: (body: LoginRequest, signal?: AbortSignal) => request('/auth/login', {
    method: 'POST', body, signal, status: 200, response: parseSession,
  }),
  register: (body: RegisterRequest, signal?: AbortSignal) => request('/auth/register', {
    method: 'POST', body, signal, status: 201, response: parseSession,
  }),
  logout: (signal?: AbortSignal) => request('/auth/logout', {
    method: 'POST', signal, status: 204, response: 'empty',
  }),
};
