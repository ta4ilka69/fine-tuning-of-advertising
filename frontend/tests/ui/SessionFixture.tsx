import { useState } from 'react';
import { AppProvider } from '../../src/app/AppProvider';
import { SessionGuard } from '../../src/features/session/SessionGuard';
import { SessionProvider } from '../../src/features/session/SessionProvider';
import { useSession } from '../../src/features/session/context';

function SessionControls() {
  const { state, login, register, logout, restore } = useSession();
  const [error, setError] = useState('');
  const credentials = { login: 'agent_demo', password: '  test password  ' };
  const run = (operation: () => Promise<void>) => {
    setError('');
    void operation().catch((error: Error) => setError(error.message));
  };
  return (
    <>
      <h1>Проверка сессии</h1>
      <p data-testid="session-state">{state.status}</p>
      {state.status === 'authenticated' && <p>{state.user.login}</p>}
      <button onClick={() => run(() => login(credentials))}>Вход</button>
      <button onClick={() => run(() => register(credentials))}>Регистрация</button>
      <button onClick={() => run(logout)}>Выход</button>
      <button onClick={() => run(restore)}>Проверить сессию</button>
      <p data-testid="action-error">{error}</p>
      <section aria-label="Личный кабинет"><SessionGuard><p>Объявления пользователя</p></SessionGuard></section>
      <section aria-label="Администрирование"><SessionGuard role="admin"><p>Каналы администратора</p></SessionGuard></section>
    </>
  );
}

export function SessionFixture() {
  return <AppProvider><SessionProvider><SessionControls /></SessionProvider></AppProvider>;
}
