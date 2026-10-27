import type { FieldIssue, Problem } from './types';

export type RequestErrorKind = 'http' | 'network' | 'aborted' | 'invalid-response';

export class RequestError extends Error {
  readonly kind: RequestErrorKind;
  readonly status?: number;
  readonly problem?: Problem;
  readonly retryAfterSeconds?: number;

  constructor(kind: RequestErrorKind, status?: number, problem?: Problem, retryAfterSeconds?: number) {
    const messages = {
      http: status !== undefined && status >= 500
        ? 'Сервис временно недоступен. Попробуйте позже.'
        : 'Не удалось выполнить запрос. Попробуйте ещё раз.',
      network: 'Не удалось связаться с сервером. Проверьте подключение к сети.',
      aborted: 'Запрос отменён.',
      'invalid-response': 'Сервер вернул неожиданный ответ. Попробуйте позже.',
    };
    super(kind === 'http' && status !== undefined && status < 500 && problem ? problem.title : messages[kind]);
    this.name = 'RequestError';
    this.kind = kind;
    this.status = status;
    this.problem = problem;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  get code() { return this.problem?.code; }
  get requestId() { return this.problem?.requestId; }
  get fieldErrors() { return this.problem?.fieldErrors; }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const hasText = (value: unknown): value is string => typeof value === 'string' && /\S/.test(value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isFieldIssue(value: unknown): value is FieldIssue {
  return isRecord(value) && hasText(value.code) && typeof value.field === 'string'
    && value.field.startsWith('/') && hasText(value.message);
}

export function parseProblem(value: unknown, status: number): Problem | undefined {
  if (!isRecord(value) || typeof value.type !== 'string' || !hasText(value.title)
    || value.status !== status || !hasText(value.code) || typeof value.requestId !== 'string'
    || !uuid.test(value.requestId)
    || (value.detail !== undefined && typeof value.detail !== 'string')
    || (value.currentVersion !== undefined && (!Number.isInteger(value.currentVersion) || Number(value.currentVersion) < 1))
    || (value.fieldErrors !== undefined && (!Array.isArray(value.fieldErrors) || !value.fieldErrors.every(isFieldIssue)))) {
    return undefined;
  }
  return {
    type: value.type, title: value.title, status, code: value.code, requestId: value.requestId,
    ...(value.detail !== undefined ? { detail: value.detail as string } : {}),
    ...(value.currentVersion !== undefined ? { currentVersion: value.currentVersion as number } : {}),
    ...(value.fieldErrors !== undefined ? { fieldErrors: (value.fieldErrors as FieldIssue[]).map(({ code, field, message }) => ({ code, field, message })) } : {}),
  };
}

export function transportError(error: unknown, signal?: AbortSignal): RequestError {
  return new RequestError(signal?.aborted || (error instanceof Error && error.name === 'AbortError') ? 'aborted' : 'network');
}
