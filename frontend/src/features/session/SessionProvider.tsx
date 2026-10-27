import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { account } from '../../shared/api/account';
import { RequestError } from '../../shared/api/errors';
import type { LoginRequest, RegisterRequest } from '../../shared/api/types';
import { SessionContext } from './context';
import type { SessionState } from './context';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'checking' });
  const revision = useRef(0);
  const restoration = useRef<AbortController | null>(null);
  const mutation = useRef(false);

  const invalidate = useCallback(() => {
    revision.current += 1;
    restoration.current?.abort();
    restoration.current = null;
    return revision.current;
  }, []);

  const checkSession = useCallback(() => {
    if (mutation.current) return;
    const current = invalidate();
    const controller = new AbortController();
    restoration.current = controller;
    return account.me(controller.signal).then((session) => {
      if (revision.current === current) setState({ status: 'authenticated', user: session.user });
    }, (error: unknown) => {
      if (revision.current !== current) return;
      if (error instanceof RequestError && error.kind === 'http' && error.status === 401) {
        setState({ status: 'anonymous' });
      } else {
        setState({ status: 'error', error: error instanceof RequestError ? error : new RequestError('invalid-response') });
      }
    });
  }, [invalidate]);

  const restore = useCallback(async () => {
    if (mutation.current) return;
    setState({ status: 'checking' });
    await checkSession();
  }, [checkSession]);

  useEffect(() => {
    void checkSession();
    return () => { invalidate(); };
  }, [checkSession, invalidate]);

  const changeSession = useCallback(async (operation: () => Promise<SessionState>) => {
    if (mutation.current) throw new Error('Изменение сессии уже выполняется');
    mutation.current = true;
    const current = invalidate();
    try {
      const next = await operation();
      if (revision.current === current) setState(next);
    } catch (error) {
      if (revision.current === current && state.status === 'checking') {
        mutation.current = false;
        void restore();
      }
      throw error;
    } finally {
      mutation.current = false;
    }
  }, [invalidate, restore, state.status]);

  const login = useCallback((credentials: LoginRequest) => changeSession(async () => ({
    status: 'authenticated', user: (await account.login(credentials)).user,
  })), [changeSession]);
  const register = useCallback((credentials: RegisterRequest) => changeSession(async () => ({
    status: 'authenticated', user: (await account.register(credentials)).user,
  })), [changeSession]);
  const logout = useCallback(() => changeSession(async () => {
    await account.logout();
    return { status: 'anonymous' };
  }), [changeSession]);
  const value = useMemo(() => ({ state, restore, login, register, logout }), [state, restore, login, register, logout]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
