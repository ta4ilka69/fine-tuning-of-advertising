import { request } from './client';
import { isRecord } from './errors';

export type AdminChannelWrite = {
  name: string;
  description: string;
  limits: { titleLimit: number | null; textLimit: number | null };
  instruction: string;
  checklist: string[];
  isActive: boolean;
};

export type AdminChannel = AdminChannelWrite & { id: string; number: number };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hasText = (value: unknown): value is string => typeof value === 'string' && /\S/.test(value);
const positiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const isLimit = (value: unknown): value is number | null => value === null || positiveInteger(value);

function parseChannel(value: unknown): AdminChannel {
  if (!isRecord(value) || typeof value.id !== 'string' || !uuid.test(value.id) || !positiveInteger(value.number)
    || !hasText(value.name) || typeof value.description !== 'string' || !hasText(value.instruction)
    || !Array.isArray(value.checklist) || value.checklist.length < 1 || !value.checklist.every(hasText)
    || typeof value.isActive !== 'boolean' || !isRecord(value.limits)) {
    throw new TypeError('Некорректная площадка');
  }
  const { id, number, name, description, limits, instruction, checklist, isActive } = value;
  const { titleLimit, textLimit } = limits;
  if (!isLimit(titleLimit) || !isLimit(textLimit)) throw new TypeError('Некорректные ограничения площадки');
  return { id, number, name, description, limits: { titleLimit, textLimit }, instruction, checklist, isActive };
}

function parseChannels(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.items)) throw new TypeError('Некорректный список площадок');
  const items = value.items.map(parseChannel);
  if (new Set(items.map(({ id }) => id.toLowerCase())).size !== items.length) throw new TypeError('Повтор площадки');
  return items;
}

export const adminChannels = {
  list: (signal?: AbortSignal) => request('/admin/channels', { signal, status: 200, response: parseChannels }),
  create: (body: AdminChannelWrite, signal?: AbortSignal) => request('/admin/channels', { method: 'POST', body, signal, status: 201, response: parseChannel }),
};
