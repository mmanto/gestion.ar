import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { UvIcon } from './UvIcon';

interface ModalProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

/** Overlay de la demo (`.modal` / `.mbox`), con Esc, click afuera y scroll bloqueado. */
export function Modal({ open, title, onClose, children, wide = false }: ModalProps) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    const focus = window.setTimeout(() => {
      box.current
        ?.querySelector<HTMLElement>('input:not([type=hidden]):not([readonly]):not([type=checkbox]):not([type=radio]), select, textarea')
        ?.focus();
    }, 30);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(focus);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`mbox ${wide ? 'wide' : ''}`} ref={box} role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="ico mx" aria-label="Cerrar" onClick={onClose}>
          <UvIcon name="x" />
        </button>
        {title ? <h3>{title}</h3> : null}
        {children}
      </div>
    </div>
  );
}
