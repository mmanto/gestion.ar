import type { ReactNode } from 'react';
import { SidebarInset, SidebarProvider } from '@mmanto/devbout-ui';
import { useSidebarVisible } from '../../hooks/useSidebarVisible';
import { readSidebarOpen } from '../../utils/sidebarState';
import { ShellHeader } from './ShellHeader';
import { ShellSidebar } from './ShellSidebar';

interface DevboutAppLayoutProps {
  children: ReactNode;
}

/**
 * Shell del tema «Panel», portado de devbout-ui/base: sidebar colapsable a
 * iconos (`SidebarProvider` + `Sidebar` del paquete) + contenido en un
 * `SidebarInset` con header de breadcrumb.
 *
 * A diferencia del template `default` (Navbar oscura + sidebar propio), acá
 * TODO el chrome lo aporta `@mmanto/devbout-ui`; el contenido de las páginas
 * se monta tal cual: no se agrega contenedor con padding propio porque cada
 * página ya trae el suyo (`PageHeader` + `p-*`), igual que antes.
 *
 * El `SidebarProvider` vive acá y no en `App.tsx` para no envolver las rutas
 * públicas (Landing, Login, Chat) en su contenedor flex.
 */
export function DevboutAppLayout({ children }: DevboutAppLayoutProps) {
  const sidebarVisible = useSidebarVisible();

  return (
    <SidebarProvider defaultOpen={readSidebarOpen()}>
      {sidebarVisible && <ShellSidebar />}
      {/* `bg-background` del paquete es blanco; el backoffice del tenant usa el
          gris de página de siempre, así el contenido no cambia de fondo. */}
      <SidebarInset className="bg-[#F8F9FD]">
        <ShellHeader showTrigger={sidebarVisible} />
        <div className="flex flex-1 flex-col pb-safe-area">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
