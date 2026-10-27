import type { ListingSummary } from '../../shared/api/types';

export const propertyNames = { flat: 'Квартира', room: 'Комната', house: 'Дом', apartments: 'Апартаменты' };
export const dealNames = { sale: 'Продажа', long_term_rent: 'Длительная аренда', short_term_rent: 'Посуточная аренда' };

export function formatPrice({ price, dealType }: Pick<ListingSummary, 'price' | 'dealType'>) {
  if (price === null) return 'Цена не указана';
  const [integer, fraction] = price.amount.split('.');
  const amount = integer!.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + (fraction ? `,${fraction}` : '');
  const period = dealType === 'long_term_rent' ? ' / мес.' : dealType === 'short_term_rent' ? ' / сутки' : '';
  return `${amount}\u00a0₽${period}`;
}

export function generationLabels(item: ListingSummary) {
  const result = item.generatedForVersion === null ? null
    : item.generatedForVersion === item.version ? { text: 'Результат готов', tone: 'success' }
      : { text: 'Данные изменились', tone: 'warning' };
  const latest = item.latestGenerationStatus;
  const run = latest === 'queued' ? { text: 'В очереди', tone: 'info' }
    : latest === 'running' ? { text: 'Генерация идёт', tone: 'info' }
      : latest === 'failed' ? { text: 'Последний запуск: ошибка', tone: 'error' } : null;
  return [result, run].filter((label) => label !== null).concat(!result && !run
    ? [{ text: 'Черновик', tone: 'neutral' }] : []);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Moscow' }).format(new Date(value));
}
