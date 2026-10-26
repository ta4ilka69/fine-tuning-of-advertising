import { HomePage } from '../pages/home/HomePage';
import { AppProvider } from './AppProvider';

export function App() {
  return (
    <AppProvider>
      <HomePage />
    </AppProvider>
  );
}
