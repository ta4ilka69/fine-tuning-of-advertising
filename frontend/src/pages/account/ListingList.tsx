import { Paper, Skeleton, Stack, Text, Title } from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { listings } from '../../shared/api/listings';
import { RequestError } from '../../shared/api/errors';
import type { ListingSummary } from '../../shared/api/types';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import { LoadingState } from '../../shared/ui/LoadingState';
import { dealNames, formatDate, formatPrice, generationLabels, propertyNames } from './format';
import classes from './Listings.module.css';
import { navigate } from '../../app/navigation';

export function ListingCard({ item, linked = true }: { item: ListingSummary; linked?: boolean }) {
  return (
    <li className={classes.card}>
      <div className={classes.object}>
        <Title order={2} size="h3">{linked ? <a className={classes.link} href={`/app/listings/${item.id}`} onClick={(event) => {
          if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
            event.preventDefault(); navigate(`/app/listings/${item.id}`);
          }
        }}>{item.address?.trim() || 'Новый черновик'}</a> : item.address?.trim() || 'Новый черновик'}</Title>
        <Text size="sm" c="dimmed">{item.propertyType ? propertyNames[item.propertyType] : 'Тип объекта не указан'} · {item.dealType ? dealNames[item.dealType] : 'Тип сделки не указан'}</Text>
      </div>
      <Text fw={600} className={classes.price}>{formatPrice(item)}</Text>
      <div className={classes.dates}>
        <Text size="xs" c="dimmed">Создано <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></Text>
        <Text size="xs" c="dimmed">Обновлено <time dateTime={item.updatedAt}>{formatDate(item.updatedAt)}</time></Text>
      </div>
      <div className={classes.statuses}>{generationLabels(item).map(({ text, tone }) => <span key={text} className={classes.badge} data-tone={tone}>{text}</span>)}</div>
    </li>
  );
}

export function ListingList({ recheck }: { recheck: (unauthorized: boolean) => void }) {
  const [items, setItems] = useState<ListingSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string>();
  const controller = useRef<AbortController | null>(null);
  const visited = useRef(new Set<string>());

  const load = useCallback((next?: string) => {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    return listings.page(next, request.signal).then((page) => {
      if (request.signal.aborted) return;
      if (page.nextCursor !== null && (page.nextCursor === next || visited.current.has(page.nextCursor))) {
        throw new RequestError('invalid-response');
      }
      if (next) visited.current.add(next);
      setItems((previous) => {
        const ids = new Set(previous.map((item) => item.id));
        return [...previous, ...page.items.filter((item) => { if (ids.has(item.id)) return false; ids.add(item.id); return true; })];
      });
      setCursor(page.nextCursor);
      recheck(false);
    }).catch((failure: unknown) => {
      if (request.signal.aborted) return;
      if (failure instanceof RequestError && failure.status === 401) {
        setItems([]);
        setCursor(null);
        visited.current.clear();
        setError('Не удалось получить доступ к объявлениям. Повторите загрузку.');
        recheck(true);
      } else {
        setError(failure instanceof RequestError ? failure.message : 'Не удалось загрузить объявления. Попробуйте ещё раз.');
      }
    }).finally(() => {
      if (!request.signal.aborted) { controller.current = null; setPending(false); }
    });
  }, [recheck]);

  const start = (next?: string) => {
    recheck(false);
    setPending(true);
    setError(undefined);
    void load(next);
  };

  useEffect(() => {
    void load();
    return () => { controller.current?.abort(); controller.current = null; };
  }, [load]);

  return (
    <Stack gap="lg">
      {items.length > 0 && (
        <Paper className={classes.list}>
          <div className={classes.columns} aria-hidden="true"><span>Объект</span><span>Цена</span><span>Даты</span><span>Состояние</span></div>
          <ul className={classes.items} aria-label="Мои объявления">{items.map((item) => <ListingCard key={item.id} item={item} />)}</ul>
        </Paper>
      )}
      {pending && items.length === 0 && <Paper className={classes.state}><LoadingState label="Загружаем объявления" /><Text c="dimmed">Подождите, пока появится список ваших объектов.</Text><div aria-hidden="true"><Skeleton height={72} mt="lg" /><Skeleton height={72} mt="md" /><Skeleton height={72} mt="md" /></div></Paper>}
      {error && <AppNotice tone="error" title={items.length ? 'Не удалось загрузить следующую страницу' : 'Не удалось загрузить объявления'}><p>{error}</p><AppButton onClick={() => { start(cursor ?? undefined); }}>Повторить</AppButton></AppNotice>}
      {!pending && !error && items.length === 0 && cursor === null && <Paper className={classes.state}><Title order={2}>Пока нет объявлений</Title><Text c="dimmed">Создайте первое объявление, чтобы начать работу с объектом.</Text><div><AppButton onClick={() => navigate('/app/new')}>Создать объявление</AppButton></div></Paper>}
      {items.length > 0 && pending && <LoadingState label="Загружаем ещё объявления" />}
      {cursor !== null && !error && <div><AppButton intent="secondary" loading={pending} onClick={() => { start(cursor); }}>Показать ещё</AppButton></div>}
      {items.length > 0 && cursor === null && !pending && !error && <Text size="sm" c="dimmed" role="status">Все объявления загружены</Text>}
    </Stack>
  );
}
