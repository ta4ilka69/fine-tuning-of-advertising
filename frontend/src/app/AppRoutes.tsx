import { Anchor, Title } from '@mantine/core';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { useSession } from '../features/session/context';
import { HomePage } from '../pages/home/HomePage';
import { LoadingState } from '../shared/ui/LoadingState';
import { PageLayout } from '../shared/ui/PageLayout';
import { navigate, usePathname } from './navigation';

const LoginPage = lazy(() => import('../pages/login/LoginPage'));
const AccountPage = lazy(() => import('../pages/account/AccountPage'));

export function AppRoutes() {
  const path = usePathname();
  const previousPath = useRef(path);
  const { state } = useSession();
  useEffect(() => {
    document.title = path === '/' ? 'Докрутка объявления' : path === '/login' ? 'Вход' : path === '/app' ? 'Личный кабинет' : 'Страница не найдена';
    if (previousPath.current !== path) document.getElementById('main-content')?.focus();
    previousPath.current = path;
  }, [path]);
  useEffect(() => {
    if (path === '/login' && state.status === 'authenticated') navigate('/app', true);
    if (path === '/app' && state.status === 'anonymous') navigate('/login', true);
  }, [path, state.status]);

  if (path === '/') return <HomePage onStart={() => navigate(state.status === 'authenticated' ? '/app' : '/login')} />;
  if (path === '/login' || path === '/app') {
    return (
      <Suspense fallback={<PageLayout header={{ variant: 'guest' }}><LoadingState label="Загружаем страницу" /></PageLayout>}>
        {path === '/login' ? <LoginPage /> : <AccountPage />}
      </Suspense>
    );
  }
  return <PageLayout header={{ variant: 'guest' }}><Title order={1}>Страница не найдена</Title><Anchor href="/">На главную</Anchor></PageLayout>;
}
