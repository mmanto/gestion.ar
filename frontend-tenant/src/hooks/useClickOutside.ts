import { useEffect, type RefObject } from 'react';

/** Cierra al hacer click fuera de todos los refs dados (útil cuando el trigger
 * y el panel no son hermanos en el DOM, ej. un panel portado a document.body). */
export function useClickOutside(
  refs: RefObject<HTMLElement | null> | RefObject<HTMLElement | null>[],
  handler: () => void,
  active: boolean = true
) {
  useEffect(() => {
    if (!active) return;
    const list = Array.isArray(refs) ? refs : [refs];
    const listener = (e: MouseEvent) => {
      if (list.every((r) => r.current && !r.current.contains(e.target as Node))) {
        handler();
      }
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [active, handler]);
}
