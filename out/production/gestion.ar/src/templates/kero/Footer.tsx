import React from 'react';

export const KeroFooter: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="px-8 py-6 mt-auto">
      <div className="pt-4 border-t border-[#dee2e6] text-center text-xs text-gray-400">
        © {currentYear} gestiona. Todos los derechos reservados.
      </div>
    </footer>
  );
};
