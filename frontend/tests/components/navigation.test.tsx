import { act, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { confirmNavigation, guardNavigation, navigate, usePathname, useSearch } from '../../src/app/navigation';

function Route({ session }: { session: string }) {
  return <output>{session}:{usePathname()}{useSearch()}</output>;
}

test('новый рендер сессии во время отменённого Back видит подтверждённый маршрут и фильтры', () => {
  const path = '/app/listings/70792597-4a2a-4ddb-9d00-c2340dd8c001';
  act(() => navigate(path));
  window.history.replaceState(window.history.state, '', `${path}?source=saved`);
  const remove = guardNavigation(() => false);
  const originalPosition = Number(window.history.state.appPosition);
  const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
  const view = render(<Route session="checking" />);
  let removeReplacement: (() => void) | undefined;
  try {
    act(() => {
      window.history.replaceState({ appPosition: originalPosition - 1 }, '', '/app?source=old');
      window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
    });
    expect(go).toHaveBeenCalledWith(1);
    view.rerender(<Route session="authenticated" />);
    expect(screen.getByRole('status')).toHaveTextContent(`authenticated:${path}?source=saved`);
    removeReplacement = guardNavigation(() => true);
    expect(confirmNavigation()).toBe(false);
    act(() => {
      window.history.replaceState({ appPosition: originalPosition }, '', `${path}?source=saved`);
      window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
    });
    view.rerender(<Route session="restored" />);
    expect(screen.getByRole('status')).toHaveTextContent(`restored:${path}?source=saved`);
    expect(confirmNavigation()).toBe(true);
  } finally {
    removeReplacement?.(); remove(); go.mockRestore(); view.unmount(); act(() => navigate('/'));
  }
});

test('истёкшая сессия во время восстановления истории перенаправляет после завершения возврата', () => {
  const path = '/app/listings/70792597-4a2a-4ddb-9d00-c2340dd8c001';
  act(() => navigate(path));
  const remove = guardNavigation(() => false);
  const originalPosition = Number(window.history.state.appPosition);
  const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
  const view = render(<Route session="checking" />);
  try {
    act(() => {
      window.history.replaceState({ appPosition: originalPosition - 1 }, '', '/app');
      window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
    });
    remove();
    act(() => navigate('/login', true));
    expect(window.location.pathname).toBe('/app');
    view.rerender(<Route session="anonymous" />);
    expect(screen.getByRole('status')).toHaveTextContent(`anonymous:${path}`);
    act(() => {
      window.history.replaceState({ appPosition: originalPosition }, '', path);
      window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
    });
    expect(window.location.pathname).toBe('/login');
    expect(screen.getByRole('status')).toHaveTextContent('anonymous:/login');
  } finally { remove(); go.mockRestore(); view.unmount(); act(() => navigate('/')); }
});
