import { MantineProvider } from '@mantine/core';
import { HomePage } from '../pages/home/HomePage';
import { theme } from './theme';

export function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <HomePage />
    </MantineProvider>
  );
}
