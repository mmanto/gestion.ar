import React from 'react';
import { KeroSidebar } from './Sidebar';
import { KeroTopbar } from './Topbar';
import { KeroFooter } from './Footer';
import { KERO_PAGE_BG } from './tokens';
import { useSidebar } from '../../hooks/useSidebar';

interface KeroAppLayoutProps {
  children: React.ReactNode;
}

export function KeroAppLayout({ children }: KeroAppLayoutProps) {
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen" style={{ backgroundColor: KERO_PAGE_BG }}>
      <KeroSidebar />
      <div className={`flex flex-col min-h-screen transition-all duration-300 ${collapsed ? 'md:pl-[112px]' : 'md:pl-[304px]'}`}>
        <KeroTopbar />
        <main className="flex-grow px-8 pb-10">
          <div className="w-full">
            {children}
          </div>
        </main>
        <KeroFooter />
      </div>
    </div>
  );
}
