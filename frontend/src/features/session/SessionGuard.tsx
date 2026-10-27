import type { ReactNode } from 'react';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import { LoadingState } from '../../shared/ui/LoadingState';
import { useSession } from './context';

export function SessionGuard({ children, role }: { children: ReactNode; role?: 'admin' }) {
  const { state, restore } = useSession();
  if (state.status === 'checking') return <LoadingState label="Проверяем сессию" />;
  if (state.status === 'error') {
    return (
      <AppNotice tone="error" title="Не удалось проверить сессию">
        <p>{state.error.message}</p>
        <AppButton onClick={() => { void restore(); }}>Повторить</AppButton>
      </AppNotice>
    );
  }
  if (state.status === 'anonymous') {
    return <AppNotice tone="info" title="Войдите в аккаунт">Для доступа к странице нужен вход.</AppNotice>;
  }
  if (role && state.user.role !== role) {
    return <AppNotice tone="warning" title="Недостаточно прав">Страница доступна администратору.</AppNotice>;
  }
  return children;
}
