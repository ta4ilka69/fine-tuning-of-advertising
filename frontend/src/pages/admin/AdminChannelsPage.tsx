import { Stack, Text, Title } from '@mantine/core';
import { useRef, useState } from 'react';
import { adminChannelsPath, confirmNavigation, navigate } from '../../app/navigation';
import { actionError } from '../../features/session/actionError';
import { useSession } from '../../features/session/context';
import { SessionGuard } from '../../features/session/SessionGuard';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import { LoadingState } from '../../shared/ui/LoadingState';
import { PageLayout } from '../../shared/ui/PageLayout';
import { ChannelList } from './ChannelList';
import { ChannelSettings } from './ChannelSettings';
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

type AdminChannelsPageProps = { page: 'list' | 'create' } | { page: 'settings'; channelId: string };

export default function AdminChannelsPage(props: AdminChannelsPageProps) {
  const { page } = props;
  const { state, logout, restore } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState<{ owner: string; channel: ChannelDraft }>();
  const [deniedSettingsOwner, setDeniedSettingsOwner] = useState<string | null>(null);
  const signingOut = useRef(false);
  const checkedAdminOwner = useRef<string | null>(null);
  const user = state.status === 'authenticated' ? state.user : null;
  const adminId = user?.role === 'admin' ? user.id : null;
  const settingsOwner = page === 'settings' ? adminId : null;
  const [lastSettingsOwner, setLastSettingsOwner] = useState(settingsOwner);
  if ((user || state.status === 'anonymous') && lastSettingsOwner !== settingsOwner) setLastSettingsOwner(settingsOwner);
  if (draft && (state.status === 'anonymous' || (user && adminId !== draft.owner))) setDraft(undefined);

  const signOut = async () => {
    if (signingOut.current || !confirmNavigation()) return;
    signingOut.current = true;
    setPending(true);
    setError(undefined);
    try { await logout(); } catch (failure) { setError(actionError(failure)); }
    finally { signingOut.current = false; setPending(false); }
  };
  const recheck = (unauthorized: boolean) => {
    if (!unauthorized) { checkedAdminOwner.current = null; return; }
    if (checkedAdminOwner.current === adminId) return;
    checkedAdminOwner.current = adminId;
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
      <Stack gap="lg">
        <SessionGuard role="admin" denied={<AccessDenied />}>
          {error && <AppNotice tone="error" title="Не удалось выйти">{error}</AppNotice>}
          {pending ? <LoadingState label="Выходим…" /> : page === 'list' ? <ChannelListPage key={adminId} recheck={recheck} />
            : page === 'settings' ? deniedSettingsOwner === adminId && <AccessDenied /> : (
              <Stack gap="md" align="flex-start">
                <AppButton intent="quiet" onClick={() => navigate(adminChannelsPath)}>← Площадки</AppButton>
                <Title order={1}>Новая площадка</Title>
                <CreateChannel key={adminId} draft={draft?.owner === adminId ? draft.channel : undefined} onDraftChange={onDraftChange} restore={restore} />
              </Stack>
            )}
        </SessionGuard>
        {props.page === 'settings' && lastSettingsOwner && deniedSettingsOwner !== lastSettingsOwner && (
          <ChannelSettings key={lastSettingsOwner} id={props.channelId} suspended={pending || adminId !== lastSettingsOwner}
            recheckSession={restore} onDenied={() => setDeniedSettingsOwner(lastSettingsOwner)} />
        )}
      </Stack>
    </PageLayout>
  );
}
