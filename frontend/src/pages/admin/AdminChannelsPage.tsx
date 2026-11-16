import { Paper, Stack, Text, Title } from '@mantine/core';
import { useRef, useState } from 'react';
import { adminChannelsPath, navigate } from '../../app/navigation';
import { actionError } from '../../features/session/actionError';
import { useSession } from '../../features/session/context';
import { SessionGuard } from '../../features/session/SessionGuard';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import { LoadingState } from '../../shared/ui/LoadingState';
import { PageLayout } from '../../shared/ui/PageLayout';
import { ChannelList } from './ChannelList';
import { CreateChannel, type ChannelDraft } from './CreateChannel';

function AccessDenied() {
  return (
    <Stack gap="md" align="flex-start">
      <Title order={1}>Доступ ограничен</Title>
      <Text>Эта страница доступна только администратору</Text>
      <AppButton onClick={() => navigate('/app')}>К моим объявлениям</AppButton>
    </Stack>
  );
}

function ChannelListPage({ recheck }: { recheck: (unauthorized: boolean) => Promise<void> | undefined }) {
  const [denied, setDenied] = useState(false);
  if (denied) return <AccessDenied />;
  return <ChannelList recheck={recheck} onDenied={() => setDenied(true)} />;
}

export default function AdminChannelsPage({ page }: { page: 'list' | 'create' | 'settings' }) {
  const { state, logout, restore } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState<{ owner: string; channel: ChannelDraft }>();
  const signingOut = useRef(false);
  const checkedListOwner = useRef<string | null>(null);
  const user = state.status === 'authenticated' ? state.user : null;
  const adminId = user?.role === 'admin' ? user.id : null;
  if (draft && (state.status === 'anonymous' || (user && adminId !== draft.owner))) setDraft(undefined);

  const signOut = async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    setPending(true);
    setError(undefined);
    try { await logout(); } catch (failure) { setError(actionError(failure)); }
    finally { signingOut.current = false; setPending(false); }
  };
  const recheckList = (unauthorized: boolean) => {
    if (!unauthorized) { checkedListOwner.current = null; return; }
    if (checkedListOwner.current === adminId) return;
    checkedListOwner.current = adminId;
    return restore();
  };
  const onDraftChange = (channel: ChannelDraft) => {
    if (adminId) setDraft({ owner: adminId, channel });
  };

  return (
    <PageLayout header={user ? {
      userName: user.login, listingsHref: '/app', onLogout: () => { void signOut(); },
      ...(user.role === 'admin' ? { variant: 'admin', channelsHref: adminChannelsPath, currentSection: 'channels' } : { variant: 'user' }),
    } : { variant: 'guest' }}>
      <SessionGuard role="admin" denied={<AccessDenied />}>
        <Stack gap="lg">
          {error && <AppNotice tone="error" title="Не удалось выйти">{error}</AppNotice>}
          {pending ? <LoadingState label="Выходим…" /> : page === 'list' ? <ChannelListPage key={adminId} recheck={recheckList} /> : (
            <Stack gap="md" align="flex-start">
              <AppButton intent="quiet" onClick={() => navigate(adminChannelsPath)}>← Площадки</AppButton>
              <Title order={1}>{page === 'create' ? 'Новая площадка' : 'Настройки площадки'}</Title>
              {page === 'create' ? <CreateChannel key={adminId} draft={draft?.owner === adminId ? draft.channel : undefined} onDraftChange={onDraftChange} restore={restore} />
                : <Paper p="lg"><Text>Редактирование настроек пока недоступно</Text></Paper>}
            </Stack>
          )}
        </Stack>
      </SessionGuard>
    </PageLayout>
  );
}
