import { useSyncExternalStore } from 'react';

export type AppPath = '/' | '/login' | '/register' | '/app' | '/app/new' | `/app/listings/${string}`;

let guard: (() => boolean) | undefined;
let currentURL = window.location.href;
let position = Number(window.history.state?.appPosition ?? 0);
let reversing = false;
let deferredNavigation: { url: string; replace: boolean } | undefined;
window.history.replaceState({ ...window.history.state, appPosition: position }, '', currentURL);

export function guardNavigation(confirm: () => boolean) {
  guard = confirm;
  if (!reversing) {
    currentURL = window.location.href;
    position = Number(window.history.state?.appPosition ?? 0);
    window.history.replaceState({ ...window.history.state, appPosition: position }, '', currentURL);
  }
  return () => { if (guard === confirm) guard = undefined; };
}

window.addEventListener('popstate', (event) => {
  if (reversing) {
    reversing = false;
    event.stopImmediatePropagation();
    const deferred = deferredNavigation;
    deferredNavigation = undefined;
    if (deferred) changeURL(deferred.url, deferred.replace);
    return;
  }
  if (window.location.href === currentURL) return;
  const next = Number.isSafeInteger(event.state?.appPosition) ? Number(event.state.appPosition) : position + 1;
  if (!Number.isSafeInteger(event.state?.appPosition)) window.history.replaceState({ ...event.state, appPosition: next }, '', window.location.href);
  const previous = new URL(currentURL);
  const samePage = previous.pathname === window.location.pathname && previous.search === window.location.search;
  if (!samePage && guard && !guard()) {
    event.stopImmediatePropagation();
    if (position !== next) { reversing = true; window.history.go(position - next); }
    else window.history.replaceState({ ...window.history.state, appPosition: position }, '', currentURL);
    return;
  }
  position = next;
  currentURL = window.location.href;
}, { capture: true });

export const confirmNavigation = () => !reversing && (!guard || guard());

function changeURL(url: string, replace: boolean) {
  if (reversing) { deferredNavigation = { url, replace }; return; }
  if (!confirmNavigation()) return;
  if (!replace) position += 1;
  window.history[replace ? 'replaceState' : 'pushState']({ appPosition: position }, '', url);
  currentURL = window.location.href;
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
}

export function navigate(path: AppPath, replace = false) {
  if (!['/', '/login', '/register', '/app', '/app/new'].includes(path)
    && !/^\/app\/listings\/[0-9a-f-]{36}$/i.test(path)) throw new TypeError('Неизвестный маршрут');
  if (!reversing && window.location.pathname === path && !window.location.search && !window.location.hash) return;
  changeURL(path, replace);
}

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
}

export function usePathname() {
  return useSyncExternalStore(subscribe, () => reversing ? new URL(currentURL).pathname : window.location.pathname);
}

export function useSearch() {
  return useSyncExternalStore(subscribe, () => reversing ? new URL(currentURL).search : window.location.search);
}

export function setSearch(search: string) {
  if (window.location.search === search) return;
  changeURL(`${window.location.pathname}${search}${window.location.hash}`, false);
}
