import React from 'react';

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-auto" style={{ backgroundColor: '#F2F1F1' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="pt-6 text-center text-xs" style={{ color: '#25357A' }}>
          © {currentYear} iUS. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
};
