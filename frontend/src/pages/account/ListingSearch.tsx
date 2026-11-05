import { Paper, Stack, Text, TextInput } from '@mantine/core';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { setSearch, useSearch } from '../../app/navigation';
import type { ListingFilters } from '../../shared/api/listings';
import { AppButton } from '../../shared/ui/AppButton';
import { apiFilters, emptyFilters, filterError, filterSearch, readFilters, type FilterFields } from './listingFilters';
import classes from './Listings.module.css';

const validDates = { from: false, to: false };

export function ListingSearch({ children }: { children: (filters: ListingFilters, reset: () => void) => ReactNode }) {
  const search = useSearch();
  const applied = useMemo(() => readFilters(search), [search]);
  const filters = useMemo(() => applied.error ? {} : apiFilters(applied.fields), [applied]);
  const [draft, setDraft] = useState({ search, ...applied, invalidDates: validDates, dateKey: 0 });
  const invalidDate = draft.invalidDates.from || draft.invalidDates.to;
  if (draft.search !== search) setDraft({ search, ...applied, invalidDates: validDates, dateKey: draft.dateKey + (invalidDate ? 1 : 0) });
  const error = invalidDate ? 'Укажите корректные даты.' : draft.error ?? filterError(draft.fields);
  const form = useRef<HTMLFormElement>(null);
  const nativeDates = useCallback(() => {
    const from = form.current?.elements.namedItem('from') as HTMLInputElement | null;
    const to = form.current?.elements.namedItem('to') as HTMLInputElement | null;
    return { from: from?.validity.badInput ?? false, to: to?.validity.badInput ?? false };
  }, []);
  const apply = useCallback((fields: FilterFields) => {
    const invalidDates = nativeDates();
    setDraft((previous) => previous.invalidDates.from === invalidDates.from && previous.invalidDates.to === invalidDates.to
      ? previous : { ...previous, invalidDates });
    if (!invalidDates.from && !invalidDates.to && !filterError(fields)) setSearch(filterSearch(fields));
  }, [nativeDates]);
  useEffect(() => {
    if (error || draft.fields.q.trim() === applied.fields.q.trim()) return;
    const timer = setTimeout(() => apply(draft.fields), 300);
    return () => clearTimeout(timer);
  }, [draft.fields, applied.fields.q, error, apply]);
  const reset = () => {
    setDraft({ search, fields: emptyFilters, error: undefined, invalidDates: validDates, dateKey: draft.dateKey + 1 });
    setSearch(filterSearch(emptyFilters));
  };
  const edit = (key: keyof FilterFields, value: string) => {
    const invalidDates = nativeDates();
    if (draft.fields[key] === value && draft.error === undefined
      && draft.invalidDates.from === invalidDates.from && draft.invalidDates.to === invalidDates.to) return;
    const fields = { ...draft.fields, [key]: value };
    setDraft({ ...draft, search, fields, error: undefined, invalidDates });
    if (key !== 'q' && !invalidDates.from && !invalidDates.to) apply(fields);
  };
  const active = Object.values(draft.fields).some(Boolean) || Boolean(error);
  return <Stack gap="lg">
    <Paper className={classes.filters}>
      <form ref={form} noValidate onSubmit={(event) => { event.preventDefault(); if (!draft.error) apply(draft.fields); }} aria-label="Поиск и фильтры объявлений">
        <div className={classes.controls}>
          <TextInput label="Поиск по адресу" placeholder="Улица, дом или часть адреса" value={draft.fields.q} onChange={(event) => edit('q', event.currentTarget.value)} />
          <TextInput key={`from:${draft.dateKey}`} type="date" label="Дата создания: с" min="0001-01-01" max="9999-12-31" value={draft.fields.from} name="from" onInput={(event) => edit('from', event.currentTarget.value)} onKeyUp={(event) => edit('from', event.currentTarget.value)} onBlur={(event) => edit('from', event.currentTarget.value)} error={Boolean(error)} aria-describedby="listing-period-hint listing-period-error" />
          <TextInput key={`to:${draft.dateKey}`} type="date" label="Дата создания: по" min="0001-01-01" max="9999-12-30" value={draft.fields.to} name="to" onInput={(event) => edit('to', event.currentTarget.value)} onKeyUp={(event) => edit('to', event.currentTarget.value)} onBlur={(event) => edit('to', event.currentTarget.value)} error={Boolean(error)} aria-describedby="listing-period-hint listing-period-error" />
          <AppButton type="submit" intent="secondary">Найти</AppButton>
        </div>
        <Text id="listing-period-hint" size="sm" c="dimmed" mt="sm">Период относится к дате создания объявления. Обе выбранные даты включены.</Text>
        <div id="listing-period-error" role={error ? 'alert' : undefined}>{error && <Text c="red" size="sm" mt="sm">{error}</Text>}</div>
        {active && <AppButton intent="quiet" className={classes.reset} onClick={reset}>Сбросить фильтры</AppButton>}
      </form>
    </Paper>
    {!error && !applied.error && children(filters, reset)}
  </Stack>;
}
