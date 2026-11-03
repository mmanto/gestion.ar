import { useLocation } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  Separator,
  SidebarTrigger,
} from '@mmanto/devbout-ui';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../hooks/useTenant';
import { sectionLabel, visibleNavGroups } from './navItems';

interface ShellHeaderProps {
  /** Sin sidebar (Ajustes > Marca > «mostrar barra lateral» apagado) no hay
   * nada que colapsar: el trigger se omite y queda sólo el breadcrumb. */
  showTrigger?: boolean;
}

/**
 * Header de las páginas del tema «Panel»: trigger del sidebar, separador
 * vertical y breadcrumb con la sección actual, portado de
 * `app/projects/page.tsx` de devbout-ui/base.
 *
 * El título grande de cada pantalla lo sigue pintando el contenido
 * (`PageHeader`): acá sólo va la miga, para no duplicar el encabezado.
 */
export function ShellHeader({ showTrigger = true }: ShellHeaderProps) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { tenant } = useTenant();
  const label = sectionLabel(
    pathname,
    visibleNavGroups(tenant?.branding.industry, user?.role),
  );

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 bg-[#F8F9FD] transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex items-center gap-2 px-4">
        {showTrigger && (
          <>
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
          </>
        )}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>{label}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  );
}
