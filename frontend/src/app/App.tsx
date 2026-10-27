import { SessionProvider } from '../features/session/SessionProvider';
import { AppRoutes } from './AppRoutes';
import { AppProvider } from './AppProvider';

export function App() {
  return (
    <AppProvider>
      <SessionProvider>
        <AppRoutes />
      </SessionProvider>
    </AppProvider>
  );
}
