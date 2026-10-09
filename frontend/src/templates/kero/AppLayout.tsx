import React from 'react';
import { KeroSidebar } from './Sidebar';
import { KeroTopbar } from './Topbar';
import { KeroFooter } from './Footer';
import { KERO_PAGE_BG } from './tokens';
import { SidebarProvider } from '../../components/ui/sidebar';
import { useSidebar } from '../../components/ui/sidebar-context';
import { readSidebarOpen } from '../../lib/sidebar';

interface KeroAppLayoutProps {
  children: React.ReactNode;
}

/**
 * Contenido del shell de Kero. Va en un componente aparte porque consume
 * `useSidebar()`, que sólo existe debajo del `SidebarProvider`.
 */
function KeroShell({ children }: KeroAppLayoutProps) {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  return (
    <div className="w-full min-h-screen" style={{ backgroundColor: KERO_PAGE_BG }}>
      <KeroSidebar />
      <div className={`flex flex-col min-h-screen transition-all duration-300 ${collapsed ? 'md:pl-[112px]' : 'md:pl-[304px]'}`}>
        <KeroTopbar />
        <main className="grow px-8 pb-10">
          <div className="w-full">
            {children}
          </div>
        </main>
        <KeroFooter />
      </div>
    </div>
  );
}

export function KeroAppLayout({ children }: KeroAppLayoutProps) {
  return (
    <SidebarProvider defaultOpen={readSidebarOpen()}>
      <KeroShell>{children}</KeroShell>
    </SidebarProvider>
  );
}
