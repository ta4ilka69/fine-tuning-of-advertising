import { Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { listings } from '../../shared/api/listings';
import { RequestError } from '../../shared/api/errors';
import type { ListingSummary } from '../../shared/api/types';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import { LoadingState } from '../../shared/ui/LoadingState';
import { ListingCard } from './ListingList';
import classes from './Listings.module.css';

export function ListingDetails({ id, recheck }: { id: string; recheck: (unauthorized: boolean) => void }) {
  const [item, setItem] = useState<ListingSummary>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void listings.get(id, controller.signal).then((value) => {
      if (!controller.signal.aborted) { setItem(value); recheck(false); }
    }, (failure: unknown) => {
      if (controller.signal.aborted) return;
      if (failure instanceof RequestError && failure.status === 401) recheck(true);
      setError(failure instanceof RequestError && failure.status === 404 ? 'Объявление не найдено или больше недоступно.'
        : failure instanceof RequestError ? failure.message : 'Не удалось загрузить объявление. Попробуйте ещё раз.');
    });
    return () => controller.abort();
  }, [id, recheck, attempt]);
  return <Stack gap="lg">
    {item ? <><ul className={classes.items}><ListingCard item={item} linked={false} /></ul><Text c="dimmed">Здесь доступны основные данные объекта. Форма и редактирование появятся позже.</Text></>
      : error ? <AppNotice tone="error" title="Не удалось загрузить объявление"><p>{error}</p><AppButton onClick={() => { recheck(false); setError(undefined); setAttempt((value) => value + 1); }}>Повторить</AppButton></AppNotice>
        : <LoadingState label="Загружаем объявление" />}
  </Stack>;
}
