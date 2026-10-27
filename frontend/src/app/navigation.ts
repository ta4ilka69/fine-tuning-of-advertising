import { useSyncExternalStore } from 'react';

export function navigate(path: '/' | '/login' | '/register' | '/app', replace = false) {
  if (window.location.pathname === path && !window.location.search && !window.location.hash) return;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
}

export function usePathname() {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}
