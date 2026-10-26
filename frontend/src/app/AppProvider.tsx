import { MantineProvider } from '@mantine/core';
import type { ReactNode } from 'react';
import { cssVariablesResolver, theme } from './theme';

export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} forceColorScheme="light">
      {children}
    </MantineProvider>
  );
}
