import { SessionProvider } from '../features/session/SessionProvider';
import { HomePage } from '../pages/home/HomePage';
import { AppProvider } from './AppProvider';

export function App() {
  return (
    <AppProvider>
      <SessionProvider>
        <HomePage />
      </SessionProvider>
    </AppProvider>
  );
}
