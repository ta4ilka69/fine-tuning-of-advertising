import { Paper, Stack, Text, Title } from '@mantine/core';
import { useRef, useState } from 'react';
import { adminChannelsPath, navigate } from '../../app/navigation';
import { actionError } from '../../features/session/actionError';
import { useSession } from '../../features/session/context';
import { SessionGuard } from '../../features/session/SessionGuard';
import { RequestError } from '../../shared/api/errors';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import { LoadingState } from '../../shared/ui/LoadingState';
import { PageLayout } from '../../shared/ui/PageLayout';
import { ChannelList } from './ChannelList';
import { CreateChannel } from './CreateChannel';

function AccessDenied() {
  return (
    <Stack gap="md" align="flex-start">
      <Title order={1}>Доступ ограничен</Title>
      <Text>Эта страница доступна только администратору</Text>
      <AppButton onClick={() => navigate('/app')}>К моим объявлениям</AppButton>
    </Stack>
  );
}

function ChannelPageContent({ page, recheck }: { page: 'list' | 'create' | 'settings'; recheck: () => void }) {
  const [denied, setDenied] = useState(false);
  const handleAccessError = (error: unknown) => {
    if (error instanceof RequestError && error.status === 401) recheck();
    if (error instanceof RequestError && error.status === 403) setDenied(true);
  };

  if (denied) return <AccessDenied />;
  if (page === 'list') return <ChannelList onAccessError={handleAccessError} />;
  return (
    <Stack gap="md" align="flex-start">
      <AppButton intent="quiet" onClick={() => navigate(adminChannelsPath)}>← Площадки</AppButton>
      <Title order={1}>{page === 'create' ? 'Новая площадка' : 'Настройки площадки'}</Title>
      {page === 'create' ? <CreateChannel onAccessError={handleAccessError} />
        : <Paper p="lg"><Text>Редактирование настроек пока недоступно</Text></Paper>}
    </Stack>
  );
}

export default function AdminChannelsPage({ page, path }: { page: 'list' | 'create' | 'settings'; path: string }) {
  const { state, logout, restore } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const signingOut = useRef(false);
  const recheckedPath = useRef<string | null>(null);
  const user = state.status === 'authenticated' ? state.user : null;
  const signOut = async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    setPending(true);
    setError(undefined);
    try { await logout(); } catch (failure) { setError(actionError(failure)); }
    finally { signingOut.current = false; setPending(false); }
  };
  const recheck = () => {
    if (recheckedPath.current === path) return;
    recheckedPath.current = path;
    void restore();
  };

  return (
    <PageLayout header={user ? {
      userName: user.login, listingsHref: '/app', onLogout: () => { void signOut(); },
      ...(user.role === 'admin' ? { variant: 'admin', channelsHref: adminChannelsPath, currentSection: 'channels' } : { variant: 'user' }),
    } : { variant: 'guest' }}>
      <SessionGuard role="admin" denied={<AccessDenied />}>
        <Stack gap="lg">
          {error && <AppNotice tone="error" title="Не удалось выйти">{error}</AppNotice>}
          {pending ? <LoadingState label="Выходим…" /> : <ChannelPageContent key={`${user?.id}:${path}`} page={page} recheck={recheck} />}
        </Stack>
      </SessionGuard>
    </PageLayout>
  );
}
