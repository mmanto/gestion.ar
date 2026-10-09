import React from 'react';
import { SidebarInset, SidebarProvider } from '../../components/ui/sidebar';
import { readSidebarOpen } from '../../lib/sidebar';
import { AdminHeader } from './AdminHeader';
import { AppSidebar } from './AppSidebar';

interface DefaultAppLayoutProps {
  children: React.ReactNode;
}

/**
 * Shell del template `default` («Clásico»), portado de devbout-ui/base:
 * sidebar colapsable a iconos + contenido en un inset con header de breadcrumb.
 * El `SidebarProvider` vive acá y no en `App.tsx` para no envolver las rutas
 * públicas en su contenedor flex.
 */
export function DefaultAppLayout({ children }: DefaultAppLayoutProps) {
  return (
    <SidebarProvider defaultOpen={readSidebarOpen()}>
      <AppSidebar />
      <SidebarInset>
        <AdminHeader />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
