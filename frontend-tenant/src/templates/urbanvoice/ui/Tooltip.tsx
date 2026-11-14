import { useEffect, useRef, useState } from 'react';

/** Tooltip de la demo para elementos `[data-tip]` dentro del tema. */
export function TooltipHost() {
  const [html, setHtml] = useState<string | null>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const target = (e.target as Element | null)?.closest('[data-tip]');
      if (!target || !ref.current?.closest('.uv-admin')) {
        setHtml(null);
        return;
      }
      setHtml(target.getAttribute('data-tip'));
      requestAnimationFrame(() => {
        const box = ref.current?.getBoundingClientRect();
        const w = box?.width || 0;
        const h = box?.height || 0;
        setPos({
          left: Math.min(window.innerWidth - w - 8, Math.max(8, e.clientX - w / 2)),
          top: e.clientY - h - 12,
        });
      });
    };
    document.addEventListener('mousemove', move);
    return () => document.removeEventListener('mousemove', move);
  }, []);

  return (
    <div
      className="tip"
      ref={ref}
      hidden={!html}
      style={{ left: pos.left, top: pos.top }}
      dangerouslySetInnerHTML={html ? { __html: html } : undefined}
    />
  );
}
