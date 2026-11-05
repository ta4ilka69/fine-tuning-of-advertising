import type { ListingFilters } from '../../shared/api/listings';

export type FilterFields = { q: string; from: string; to: string };
export const emptyFilters: FilterFields = { q: '', from: '', to: '' };

function localDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  if (year < 1) return null;
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function filterError(fields: FilterFields) {
  if ((fields.from && !localDay(fields.from)) || (fields.to && !localDay(fields.to))) return 'Укажите корректные даты.';
  if (fields.from && fields.to && fields.from > fields.to) return 'Начало периода не может быть позже конца.';
  if (fields.to === '9999-12-31') return 'Укажите дату окончания раньше 31 декабря 9999 года.';
  return undefined;
}

export function readFilters(search: string) {
  const params = new URLSearchParams(search);
  const fields: FilterFields = { q: params.get('q') ?? '', from: params.get('from') ?? '', to: params.get('to') ?? '' };
  const error = ['q', 'from', 'to'].some((key) => params.getAll(key).length > 1) ? 'В ссылке повторяются параметры фильтров. Сбросьте фильтры или укажите их заново.' : filterError(fields);
  return { fields, error };
}

export function filterSearch(fields: FilterFields) {
  const params = new URLSearchParams(window.location.search);
  for (const key of ['q', 'from', 'to', 'cursor', 'limit']) params.delete(key);
  for (const key of ['q', 'from', 'to'] as const) {
    const value = key === 'q' ? fields[key].trim() : fields[key];
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return search ? `?${search}` : '';
}

export function apiFilters(fields: FilterFields): ListingFilters {
  const filters: ListingFilters = {};
  if (fields.q.trim()) filters.q = fields.q.trim();
  if (fields.from) filters.from = localDay(fields.from)!.toISOString();
  if (fields.to) {
    const end = localDay(fields.to)!;
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);
    filters.to = end.toISOString();
  }
  return filters;
}
