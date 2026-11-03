import type { ListingSummary } from '../../shared/api/types';

export const propertyNames = { flat: 'Квартира', room: 'Комната', house: 'Дом' };
export const dealNames = { sale: 'Продажа', rent: 'Длительная аренда', daily_rent: 'Посуточная аренда' };

export function formatPrice({ price, dealType }: Pick<ListingSummary, 'price' | 'dealType'>) {
  if (price === null) return 'Цена не указана';
  const amount = new Intl.NumberFormat('ru-RU').format(price);
  const period = dealType === 'rent' ? ' / мес.' : dealType === 'daily_rent' ? ' / сутки' : '';
  return `${amount}\u00a0₽${period}`;
}

export function generationLabels(item: ListingSummary) {
  const result = !item.hasResult ? null
    : item.status === 'ready' ? { text: 'Результат готов', tone: 'success' }
      : item.status === 'draft' ? { text: 'Данные изменились', tone: 'warning' }
        : { text: 'Сохранённый результат', tone: 'neutral' };
  const run = item.status === 'generating' ? { text: 'Генерация идёт', tone: 'info' }
    : item.status === 'failed' ? { text: 'Последний запуск: ошибка', tone: 'error' } : null;
  return [result, run].filter((label) => label !== null).concat(!result && !run
    ? [{ text: 'Черновик', tone: 'neutral' }] : []);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Moscow' }).format(new Date(value));
}
