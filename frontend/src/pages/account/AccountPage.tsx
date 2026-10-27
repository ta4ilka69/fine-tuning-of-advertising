import { Anchor, Stack, Text, Title } from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SessionGuard } from '../../features/session/SessionGuard';
import { actionError } from '../../features/session/actionError';
import { useSession } from '../../features/session/context';
import { AppNotice } from '../../shared/ui/AppNotice';
import { ListingList } from './ListingList';
import { ListingDetails } from './ListingDetails';
import { navigate, usePathname } from '../../app/navigation';
import { AppButton } from '../../shared/ui/AppButton';
import classes from './Listings.module.css';
import { PageLayout } from '../../shared/ui/PageLayout';

export default function AccountPage() {
  const path = usePathname();
  const { state, logout, restore } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const userId = state.status === 'authenticated' ? state.user.id : null;
  const checked = useRef<string | null>(null);
  useEffect(() => { checked.current = null; }, [path]);
  const recheck = useCallback((unauthorized: boolean) => {
    if (!unauthorized) { checked.current = null; return; }
    if (checked.current === userId) return;
    checked.current = userId;
    void restore();
  }, [restore, userId]);
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
          <Stack gap="lg">
            {path !== '/app' && <div><AppButton intent="quiet" onClick={() => navigate('/app')}>← Мои объявления</AppButton></div>}
            <div className={classes.heading}><Title order={1}>{path === '/app' ? 'Мои объявления' : path === '/app/new' ? 'Новое объявление' : 'Объявление'}</Title>{path === '/app' && <AppButton onClick={() => navigate('/app/new')}>Создать объявление</AppButton>}</div>
            {path === '/app' && <Text c="dimmed">Ваши объекты, черновики и готовые тексты</Text>}
            {error && <AppNotice tone="error" title="Не удалось выйти">{error}</AppNotice>}
            {pending ? <Text role="status">Выходим…</Text> : path === '/app/new'
              ? <Text>Форма создания объявления появится позже. Пока вы можете вернуться к списку своих объектов.</Text>
              : path === '/app' ? <ListingList key={state.user.id} recheck={recheck} />
                : <ListingDetails key={`${state.user.id}:${path}`} id={path.slice('/app/listings/'.length)} recheck={recheck} />}
          </Stack>
        )}
      </SessionGuard>
      {state.status === 'error' && <Anchor href="/login">Войти в аккаунт</Anchor>}
    </PageLayout>
  );
}
