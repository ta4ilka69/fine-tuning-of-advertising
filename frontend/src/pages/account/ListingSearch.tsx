import { Paper, Stack, Text, TextInput } from '@mantine/core';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { setSearch, useSearch } from '../../app/navigation';
import type { ListingFilters } from '../../shared/api/listings';
import { AppButton } from '../../shared/ui/AppButton';
import { apiFilters, emptyFilters, filterError, filterSearch, readFilters, type FilterFields } from './listingFilters';
import classes from './Listings.module.css';

export function ListingSearch({ children }: { children: (filters: ListingFilters, reset: () => void) => ReactNode }) {
  const search = useSearch();
  const applied = useMemo(() => readFilters(search), [search]);
  const filters = useMemo(() => applied.error ? {} : apiFilters(applied.fields), [applied]);
  const [draft, setDraft] = useState({ search, ...applied });
  if (draft.search !== search) setDraft({ search, ...applied });
  const error = draft.error ?? filterError(draft.fields);
  const apply = (fields: FilterFields) => {
    if (!filterError(fields)) setSearch(filterSearch(fields));
  };
  useEffect(() => {
    if (error || draft.fields.q.trim() === applied.fields.q.trim()) return;
    const timer = setTimeout(() => setSearch(filterSearch(draft.fields)), 300);
    return () => clearTimeout(timer);
  }, [draft.fields, applied.fields.q, error]);
  const reset = () => { setDraft({ search, fields: emptyFilters, error: undefined }); apply(emptyFilters); };
  const edit = (key: keyof FilterFields, value: string, invalid = false) => {
    const fields = { ...draft.fields, [key]: value };
    setDraft({ search, fields, error: invalid ? 'Укажите корректные даты.' : undefined });
    if (key !== 'q' && !invalid) apply(fields);
  };
  const active = Object.values(draft.fields).some(Boolean) || Boolean(error);
  return <Stack gap="lg">
    <Paper className={classes.filters}>
      <form noValidate onSubmit={(event) => { event.preventDefault(); if (!error) apply(draft.fields); }} aria-label="Поиск и фильтры объявлений">
        <div className={classes.controls}>
          <TextInput label="Поиск по адресу" placeholder="Улица, дом или часть адреса" value={draft.fields.q} onChange={(event) => edit('q', event.currentTarget.value)} />
          <TextInput type="date" label="Дата создания: с" min="0001-01-01" max="9999-12-31" value={draft.fields.from} onChange={(event) => edit('from', event.currentTarget.value, event.currentTarget.validity.badInput)} error={Boolean(error)} aria-describedby="listing-period-hint listing-period-error" />
          <TextInput type="date" label="Дата создания: по" min="0001-01-01" max="9999-12-30" value={draft.fields.to} onChange={(event) => edit('to', event.currentTarget.value, event.currentTarget.validity.badInput)} error={Boolean(error)} aria-describedby="listing-period-hint listing-period-error" />
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
