import { expect, test } from 'vitest';
import { apiFilters, emptyFilters, filterError, readFilters } from '../../src/pages/account/listingFilters';

for (const value of ['2026-02-29', '2026-13-01', '2026-04-31', '0000-01-01', 'garbage', '2026-1-01']) {
  test(`неверная календарная дата ${value}`, () => {
    expect(filterError({ ...emptyFilters, from: value })).toBeTruthy();
    expect(filterError({ ...emptyFilters, to: value })).toBeTruthy();
  });
}
test('границы диапазона и неполные периоды', () => {
  expect(filterError({ q: '', from: '2026-11-05', to: '2026-11-04' })).toBeTruthy();
  expect(filterError({ ...emptyFilters, to: '9999-12-31' })).toBeTruthy();
  expect(filterError({ q: '', from: '2024-02-29', to: '2024-02-29' })).toBeUndefined();
  expect(apiFilters(emptyFilters)).toEqual({});
  expect(Object.keys(apiFilters({ ...emptyFilters, from: '2026-01-01' }))).toEqual(['from']);
  expect(Object.keys(apiFilters({ ...emptyFilters, to: '2026-01-01' }))).toEqual(['to']);
});
for (const timezone of ['Europe/Moscow', 'America/New_York', 'Asia/Kathmandu']) {
  test(`полуночь, месяц, год и DST в ${timezone}`, () => {
    const previous = process.env.TZ;
    process.env.TZ = timezone;
    try {
      for (const [start, end, next] of [['2026-12-31', '2026-12-31', '2027-01-01'], ['2024-02-29', '2024-02-29', '2024-03-01'], ['2026-03-08', '2026-03-08', '2026-03-09']]) {
        const filters = apiFilters({ q: '  Лесной  ', from: start!, to: end! });
        const from = new Date(filters.from!); const to = new Date(filters.to!);
        expect(filters.q).toBe('Лесной');
        expect(from.getHours()).toBe(0); expect(to.getHours()).toBe(0);
        expect(`${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, '0')}-${String(to.getDate()).padStart(2, '0')}`).toBe(next);
        expect(to.getTime()).toBeGreaterThan(from.getTime());
        if (timezone === 'America/New_York' && start === '2026-03-08') expect(to.getTime() - from.getTime()).toBe(23 * 60 * 60 * 1000);
      }
    } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  });
}
test('URL безопасно читает пустые, неизвестные, повторные и неверные параметры', () => {
  expect(readFilters('?q=%D0%9B%D0%B5%D1%81&from=2026-10-01&other=x')).toEqual({ fields: { q: 'Лес', from: '2026-10-01', to: '' }, error: undefined });
  expect(readFilters('?q=a&q=b').error).toBeTruthy();
  expect(readFilters('?to=nope').error).toBeTruthy();
  expect(readFilters('').fields).toEqual(emptyFilters);
});

test('переход в полночь не переносит час начала на конец периода', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'America/Santiago';
  try {
    const filters = apiFilters({ q: '', from: '2019-09-08', to: '2019-09-08' });
    expect(filters.from).toBe('2019-09-08T04:00:00.000Z');
    expect(filters.to).toBe('2019-09-09T03:00:00.000Z');
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
