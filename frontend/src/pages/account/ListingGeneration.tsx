import { Checkbox, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { useEffect, useLayoutEffect, useState } from 'react';
import { generation, type Channel } from '../../shared/api/generation';
import { RequestError } from '../../shared/api/errors';
import type { FieldIssue } from '../../shared/api/types';
import { photoRequirement } from '../../features/listing-photos/generation';
import { generationLocked, type PhotoManager, type PhotoState } from '../../features/listing-photos/model';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import { LoadingState } from '../../shared/ui/LoadingState';
import classes from './Listings.module.css';

type Channels = { status: 'loading' | 'error' } | { status: 'loaded'; items: Channel[] };

function Issues({ issues }: { issues: FieldIssue[] }) {
  return <ul className={classes.generationIssues}>{issues.map((issue, index) =>
    <li key={`${issue.field}:${issue.code}:${index}`}>{issue.message}</li>)}</ul>;
}

function useRetrySeconds(until: number | undefined) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!until) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= until) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [until]);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}

export function ListingGeneration({ manager, state, suspended, recheck }: {
  manager: PhotoManager; state: PhotoState; suspended: boolean; recheck: (unauthorized: boolean) => void;
}) {
  const [request, setRequest] = useState(0);
  const [channels, setChannels] = useState<Channels>({ status: 'loading' });
  const [selected, setSelected] = useState<string[]>([]);
  useLayoutEffect(() => {
    if (!request || suspended) return;
    const controller = new AbortController();
    void generation.channels(controller.signal).then(
      (items) => {
        if (controller.signal.aborted) return;
        recheck(false);
        setChannels({ status: 'loaded', items });
        setSelected((ids) => ids.filter((id) => items.some((item) => item.id === id)));
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setChannels({ status: 'error' });
        if (error instanceof RequestError && error.status === 401) recheck(true);
      },
    );
    return () => controller.abort();
  }, [request, suspended, recheck]);

  const loadChannels = () => { setChannels({ status: 'loading' }); setRequest((value) => value + 1); };
  const item = state.listing!;
  const feedback = state.generation;
  const seconds = useRetrySeconds(feedback?.retryAt);
  const waiting = generationLocked(state);
  const blocked = waiting || suspended || !state.verified || !!state.listingDeletion || !!state.deleting || state.uploads.some((entry) => entry.file);
  const photoHint = photoRequirement(item);
  const loading = feedback?.phase === 'validating' ? 'Проверяем данные объявления'
    : feedback?.phase === 'starting' ? 'Отправляем запрос на генерацию'
      : feedback?.phase === 'checking' && !feedback.pollError ? 'Проверяем состояние объявления' : undefined;
  return <Paper component="section" withBorder radius="lg" className={classes.generation} aria-labelledby="generation-heading">
    <Stack gap="md">
      <Title id="generation-heading" order={2}>Подготовка объявления</Title>
      {loading && <LoadingState label={loading} />}
      {item.status === 'generating' && <AppNotice tone="info" title="Идёт генерация">
        <Group gap="sm" mb="xs"><Loader size="sm" aria-hidden="true" /><Text size="sm">Готовим тексты и рекомендации</Text></Group>
        <Text size="sm">Редактирование, удаление и изменение фотографий станут доступны после завершения</Text>
      </AppNotice>}
      {item.status === 'ready' && !loading && <AppNotice tone="success" title="Подготовка завершена" />}
      {item.status === 'failed' && !loading && <AppNotice tone="error" title="Не удалось подготовить результат">
        {item.generationError?.code === 'GENERATION_TIMEOUT' ? 'Подготовка заняла слишком много времени. Повторите запуск' : 'Данные и фотографии сохранены. Попробуйте запустить генерацию ещё раз'}
      </AppNotice>}
      {item.hasResult && (item.status === 'generating' || item.status === 'failed') && <Text size="sm">Предыдущий результат сохранён</Text>}
      {feedback?.message && feedback.phase !== 'checking' && <AppNotice tone={feedback.retryAt ? 'warning' : 'error'} title={feedback.message} />}
      {feedback?.pollError && <AppNotice tone="error" title="Не удалось проверить состояние">
        <Stack gap="sm" align="flex-start">
          <Text size="sm">{feedback.pollError}</Text>
          <AppButton intent="secondary" disabled={state.reading || suspended} onClick={manager.refresh}>Проверить состояние</AppButton>
        </Stack>
      </AppNotice>}
      {!!feedback?.errors?.length && <AppNotice tone="error" title="Проверьте данные для запуска"><Issues issues={feedback.errors} /></AppNotice>}
      {!!feedback?.warnings?.length && <AppNotice tone="warning" title="Предупреждения"><Issues issues={feedback.warnings} /></AppNotice>}
      {!waiting && photoHint && <Text size="sm" c="dimmed" id="generation-photo-hint">{photoHint}</Text>}
      {!request && !waiting && <Group><AppButton intent="secondary" disabled={blocked} onClick={loadChannels}>Выбрать площадки</AppButton></Group>}
      {!!request && channels.status === 'loading' && <LoadingState label="Загружаем площадки" />}
      {!!request && channels.status === 'error' && <AppNotice tone="error" title="Не удалось загрузить площадки">
        <AppButton intent="secondary" disabled={suspended} onClick={loadChannels}>Повторить загрузку площадок</AppButton>
      </AppNotice>}
      {channels.status === 'loaded' && (channels.items.length ? <>
        <fieldset className={classes.channels} disabled={blocked}>
          <legend>Площадки</legend>
          {channels.items.map(({ id, name, description }) => <Checkbox key={id} label={name}
            description={description || undefined} disabled={blocked} checked={selected.includes(id)} onChange={(event) => {
              const checked = event.currentTarget.checked;
              setSelected((ids) => checked ? [...new Set([...ids, id])] : ids.filter((value) => value !== id));
            }} />)}
        </fieldset>
        {!selected.length && !waiting && <Text size="sm" c="dimmed" id="generation-selection-hint">Выберите одну или несколько площадок</Text>}
        <Group className={classes.generationActions}>
          <AppButton disabled={blocked || state.reading || !selected.length || !!photoHint || seconds > 0}
            aria-describedby={!waiting && photoHint ? 'generation-photo-hint' : !waiting && !selected.length ? 'generation-selection-hint' : undefined}
            onClick={() => { void manager.generate(selected); }}>
            {seconds ? `Повторить через ${seconds} с` : item.status === 'failed' ? 'Повторить генерацию' : 'Сгенерировать'}
          </AppButton>
          {feedback?.errors?.some((issue) => issue.field.startsWith('/channelIds'))
            && <AppButton intent="secondary" disabled={blocked} onClick={loadChannels}>Обновить площадки</AppButton>}
        </Group>
      </> : <AppNotice tone="info" title="Нет доступных площадок">
        <AppButton intent="secondary" disabled={suspended} onClick={loadChannels}>Обновить площадки</AppButton>
      </AppNotice>)}
    </Stack>
  </Paper>;
}
