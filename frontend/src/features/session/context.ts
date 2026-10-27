import { createContext, useContext } from 'react';
import type { RequestError } from '../../shared/api/errors';
import type { LoginRequest, RegisterRequest, User } from '../../shared/api/types';

export type SessionState =
  | { status: 'checking' }
  | { status: 'authenticated'; user: User }
  | { status: 'anonymous' }
  | { status: 'error'; error: RequestError };

export type SessionContextValue = {
  state: SessionState;
  restore: () => Promise<void>;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (credentials: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
};

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession() {
  const value = useContext(SessionContext);
  if (value === null) throw new Error('Для useSession нужен SessionProvider');
  return value;
}
