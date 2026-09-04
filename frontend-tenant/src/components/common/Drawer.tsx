import { useEffect } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export const Drawer = ({ open, onClose, title, children }: DrawerProps) => {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-[70] flex justify-end transition-opacity duration-300 ${
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className={`relative w-full max-w-lg bg-white shadow-2xl flex flex-col h-full transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div
          className="flex items-center justify-between px-6 py-4 border-b border-gray-300"
          style={{
            // Header a pantalla completa: queda debajo de la barra de sistema
            // en PWA standalone / app nativa. env() es 0 en navegador/desktop.
            paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
          }}
        >
          <h2 className="text-lg font-semibold text-gray-900 truncate">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-800 flex-shrink-0 ml-3"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto flex flex-col min-h-0 pb-safe-area">{children}</div>
      </div>
    </div>
  );
};

export default Drawer;
