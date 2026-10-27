import { useSyncExternalStore } from 'react';

export type AppPath = '/' | '/login' | '/register' | '/app' | '/app/new' | `/app/listings/${string}`;

export function navigate(path: AppPath, replace = false) {
  if (!['/', '/login', '/register', '/app', '/app/new'].includes(path)
    && !/^\/app\/listings\/[0-9a-f-]{36}$/i.test(path)) throw new TypeError('Неизвестный маршрут');
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
