import { useEffect, type RefObject } from 'react';
import { guardNavigation } from '../../app/navigation';

export function useUnsavedChanges(dirty: RefObject<boolean>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const confirm = () => !dirty.current || window.confirm('Есть несохранённые изменения. Уйти без сохранения?');
    const remove = guardNavigation(confirm);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { remove(); window.removeEventListener('beforeunload', beforeUnload); };
  }, [dirty, enabled]);
}
