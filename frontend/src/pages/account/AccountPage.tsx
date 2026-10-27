import { Anchor, Paper, Stack, Text, Title } from '@mantine/core';
import { useRef, useState } from 'react';
import { SessionGuard } from '../../features/session/SessionGuard';
import { actionError } from '../../features/session/actionError';
import { useSession } from '../../features/session/context';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import { PageLayout } from '../../shared/ui/PageLayout';

export default function AccountPage() {
  const { state, logout } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const submitting = useRef(false);
  const signOut = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(undefined);
    try { await logout(); } catch (failure) { setError(actionError(failure)); }
    finally { submitting.current = false; setPending(false); }
  };
  return (
    <PageLayout header={state.status === 'authenticated'
      ? { variant: 'user', userName: state.user.login, listingsHref: '/app', onLogout: () => { void signOut(); } }
      : { variant: 'guest' }}>
      <SessionGuard>
        {state.status === 'authenticated' && (
          <Paper p="lg">
            <Stack gap="lg">
              <Title order={1}>Личный кабинет</Title>
              <Text>Вы вошли как <strong>{state.user.login}</strong></Text>
              <Text c="dimmed">Здесь появится работа с объявлениями</Text>
              {error && <AppNotice tone="error" title="Не удалось выйти">{error}</AppNotice>}
              <div><AppButton intent="secondary" loading={pending} onClick={() => { void signOut(); }}>{pending ? 'Выходим…' : 'Выйти'}</AppButton></div>
            </Stack>
          </Paper>
        )}
      </SessionGuard>
      {state.status === 'error' && <Anchor href="/login">Войти в аккаунт</Anchor>}
    </PageLayout>
  );
}
