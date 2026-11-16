import { Button, Paper, Stack, Text, Title } from '@mantine/core';
import { useEffect, useEffectEvent, useState } from 'react';
import { adminChannelSettingsPath, navigate, newAdminChannelPath } from '../../app/navigation';
import { adminChannels, type AdminChannel } from '../../shared/api/admin-channels';
import { RequestError } from '../../shared/api/errors';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import classes from './Channels.module.css';

type ChannelListState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; items: AdminChannel[] };

export function ChannelList({ recheck, onDenied }: { recheck: (unauthorized: boolean) => Promise<void> | undefined; onDenied: () => void }) {
  const [state, setState] = useState<ChannelListState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const checkSession = useEffectEvent(recheck);
  const denyAccess = useEffectEvent(onDenied);

  useEffect(() => {
    const controller = new AbortController();
    void adminChannels.list(controller.signal).then((items) => {
      if (controller.signal.aborted) return;
      setState({ status: 'ready', items });
      void checkSession(false);
    }, (error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof RequestError && error.kind === 'http') {
        if (error.status === 403) { denyAccess(); return; }
        if (error.status === 401) {
          const restoration = checkSession(true);
          if (restoration) {
            void restoration.then(() => {
              if (!controller.signal.aborted) setAttempt((value) => value + 1);
            });
            return;
          }
        }
      }
      setState({ status: 'error', message: error instanceof RequestError ? error.message : 'Попробуйте ещё раз.' });
    });
    return () => controller.abort();
  }, [attempt]);

  const create = () => navigate(newAdminChannelPath);
  return (
    <Stack gap="lg">
      <div className={classes.heading}>
        <Stack gap="xs">
          <Title order={1}>Площадки</Title>
          <Text c="dimmed">Правила подготовки текстов для каждой площадки</Text>
        </Stack>
        <AppButton onClick={create}>Создать площадку</AppButton>
      </div>
      {state.status === 'loading' && <AppNotice tone="loading" title="Загружаем площадки" />}
      {state.status === 'error' && (
        <AppNotice tone="error" title="Не удалось загрузить площадки">
          <p>{state.message}</p>
          <AppButton onClick={() => { recheck(false); setState({ status: 'loading' }); setAttempt((value) => value + 1); }}>Повторить</AppButton>
        </AppNotice>
      )}
      {state.status === 'ready' && (state.items.length === 0 ? (
        <AppNotice tone="info" title="Пока нет площадок">
          <p>Создайте первую площадку и&nbsp;задайте правила генерации</p>
          <AppButton onClick={create}>Создать площадку</AppButton>
        </AppNotice>
      ) : (
        <ul className={classes.list} aria-label="Список площадок">
          {state.items.map((item) => (
            <Paper component="li" className={classes.card} key={item.id}>
              <Stack gap="sm" align="flex-start">
                <Title order={2}>{item.name}</Title>
                <span className={classes.badge} data-active={item.isActive}>{item.isActive ? 'Включена' : 'Выключена'}</span>
                {item.description && <Text>{item.description}</Text>}
                <Button component="a" href={adminChannelSettingsPath(item.id)} variant="default" aria-label={`Настройки: ${item.name}`} onClick={(event) => {
                  if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                    event.preventDefault();
                    navigate(adminChannelSettingsPath(item.id));
                  }
                }}>Настройки</Button>
              </Stack>
            </Paper>
          ))}
        </ul>
      ))}
    </Stack>
  );
}
