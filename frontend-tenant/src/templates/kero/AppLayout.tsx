import React from 'react';
import { KeroSidebar } from './Sidebar';
import { KeroTopbar } from './Topbar';
import { KeroFooter } from './Footer';
import { KERO_PAGE_BG } from './tokens';
import { useSidebar } from '../../hooks/useSidebar';
import { useSidebarVisible } from '../../hooks/useSidebarVisible';

interface KeroAppLayoutProps {
  children: React.ReactNode;
}

export function KeroAppLayout({ children }: KeroAppLayoutProps) {
  const { collapsed } = useSidebar();
  const sidebarVisible = useSidebarVisible();
  const contentPadding = !sidebarVisible ? 'md:pl-0' : collapsed ? 'md:pl-[112px]' : 'md:pl-[304px]';

  return (
    <div className="min-h-screen" style={{ backgroundColor: KERO_PAGE_BG }}>
      {sidebarVisible && <KeroSidebar />}
      <div className={`flex flex-col min-h-screen transition-all duration-300 ${contentPadding}`}>
        <KeroTopbar />
        <main className="flex-grow pt-14 px-2 pb-2 md:pt-0 md:px-8 md:pb-10">
          <div className="w-full">
            {children}
          </div>
        </main>
        <KeroFooter />
      </div>
    </div>
  );
}
