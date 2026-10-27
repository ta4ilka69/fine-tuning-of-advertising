import { parseProblem, RequestError, transportError } from './errors';

export type RequestOptions<TBody> = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: TBody;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
};

type ResponseOptions<TResponse> =
  | { response: 'empty'; status: 204 }
  | { response: (value: unknown) => TResponse; status: number };

function apiURL(path: string, query?: RequestOptions<unknown>['query']) {
  if (!/^\/[a-zA-Z0-9/_-]*$/.test(path) || path.includes('//')) {
    throw new TypeError('Ожидается путь относительно API');
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.set(key, String(value));
  }
  const search = params.toString();
  return `/api/v1${path}${search ? `?${search}` : ''}`;
}

function retryAfter(response: Response) {
  const value = response.headers.get('Retry-After');
  if (response.status !== 429 || value === null || !/^[1-9]\d*$/.test(value)) return undefined;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) ? seconds : undefined;
}

export async function request<TResponse = void, TBody = never>(
  path: string,
  options: RequestOptions<TBody> & ResponseOptions<TResponse>,
): Promise<TResponse> {
  const url = apiURL(path, options.query);
  const headers = new Headers({ Accept: 'application/json, application/problem+json' });
  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (options.body instanceof FormData) body = options.body;
    else {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(options.body);
    }
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET', body, headers, signal: options.signal,
      credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store',
    });
  } catch (error) {
    throw transportError(error, options.signal);
  }
  const contentType = response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  if (!response.ok) {
    let problem;
    if (contentType === 'application/problem+json') {
      try {
        problem = parseProblem(await response.json(), response.status);
      } catch (error) {
        if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
          throw transportError(error, options.signal);
        }
      }
    }
    throw new RequestError('http', response.status, problem, retryAfter(response));
  }
  if (response.status !== options.status) throw new RequestError('invalid-response', response.status);
  if (options.response === 'empty') return undefined as TResponse;
  if (contentType !== 'application/json') throw new RequestError('invalid-response', response.status);
  let value: unknown;
  try {
    value = await response.json();
  } catch (error) {
    if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw transportError(error, options.signal);
    }
    if (error instanceof TypeError) throw transportError(error, options.signal);
    throw new RequestError('invalid-response', response.status);
  }
  try {
    return options.response(value);
  } catch {
    throw new RequestError('invalid-response', response.status);
  }
}
