import { Anchor, Title } from '@mantine/core';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { useSession } from '../features/session/context';
import { HomePage } from '../pages/home/HomePage';
import { LoadingState } from '../shared/ui/LoadingState';
import { PageLayout } from '../shared/ui/PageLayout';
import { navigate, usePathname } from './navigation';

const LoginPage = lazy(() => import('../pages/login/LoginPage'));
const RegisterPage = lazy(() => import('../pages/register/RegisterPage'));
const AccountPage = lazy(() => import('../pages/account/AccountPage'));

export function AppRoutes() {
  const path = usePathname();
  const protectedPath = path === '/app' || path === '/app/new' || /^\/app\/listings\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path);
  const previousPath = useRef(path);
  const { state } = useSession();
  useEffect(() => {
    document.title = path === '/' ? 'Докрутка объявления' : path === '/login' ? 'Вход' : path === '/register' ? 'Регистрация' : path === '/app/new' ? 'Новое объявление' : protectedPath ? 'Мои объявления' : 'Страница не найдена';
    if (previousPath.current !== path) document.getElementById('main-content')?.focus();
    previousPath.current = path;
  }, [path, protectedPath]);
  useEffect(() => {
    if ((path === '/login' || path === '/register') && state.status === 'authenticated') navigate('/app', true);
    if (protectedPath && state.status === 'anonymous') navigate('/login', true);
  }, [path, state.status, protectedPath]);

  if (path === '/') return <HomePage onStart={() => navigate(state.status === 'authenticated' ? '/app' : '/login')} />;
  if (path === '/login' || path === '/register' || protectedPath) {
    return (
      <Suspense fallback={<PageLayout header={{ variant: 'guest' }}><LoadingState label="Загружаем страницу" /></PageLayout>}>
        {path === '/login' ? <LoginPage /> : path === '/register' ? <RegisterPage /> : <AccountPage />}
      </Suspense>
    );
  }
  return <PageLayout header={{ variant: 'guest' }}><Title order={1}>Страница не найдена</Title><Anchor href="/">На главную</Anchor></PageLayout>;
}
