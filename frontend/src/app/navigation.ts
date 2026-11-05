import { useSyncExternalStore } from 'react';

export type AppPath = '/' | '/login' | '/register' | '/app' | '/app/new' | `/app/listings/${string}`;

let guard: (() => boolean) | undefined;
let currentURL = window.location.href;
let position = Number(window.history.state?.appPosition ?? 0);
let reversing = false;

export function guardNavigation(confirm: () => boolean) {
  guard = confirm;
  currentURL = window.location.href;
  position = Number(window.history.state?.appPosition ?? 0);
  window.history.replaceState({ ...window.history.state, appPosition: position }, '', currentURL);
  return () => { if (guard === confirm) guard = undefined; };
}

window.addEventListener('popstate', (event) => {
  if (reversing) { reversing = false; event.stopImmediatePropagation(); return; }
  if (window.location.href === currentURL) return;
  const next = Number(event.state?.appPosition ?? 0);
  if (guard && !guard()) {
    event.stopImmediatePropagation();
    if (position !== next) { reversing = true; window.history.go(position - next); }
    else window.history.replaceState({ ...window.history.state, appPosition: position }, '', currentURL);
    return;
  }
  position = next;
  currentURL = window.location.href;
}, { capture: true });

export const confirmNavigation = () => !guard || guard();

function changeURL(url: string, replace: boolean) {
  if (!confirmNavigation()) return;
  if (!replace) position += 1;
  window.history[replace ? 'replaceState' : 'pushState']({ appPosition: position }, '', url);
  currentURL = window.location.href;
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
}

export function navigate(path: AppPath, replace = false) {
  if (!['/', '/login', '/register', '/app', '/app/new'].includes(path)
    && !/^\/app\/listings\/[0-9a-f-]{36}$/i.test(path)) throw new TypeError('Неизвестный маршрут');
  if (window.location.pathname === path && !window.location.search && !window.location.hash) return;
  changeURL(path, replace);
}

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
}

export function usePathname() {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

export function useSearch() {
  return useSyncExternalStore(subscribe, () => window.location.search);
}

export function setSearch(search: string) {
  if (window.location.search === search) return;
  changeURL(`${window.location.pathname}${search}${window.location.hash}`, false);
}
