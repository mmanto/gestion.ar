import { useLocation } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '../../components/ui/breadcrumb';
import { Separator } from '../../components/ui/separator';
import { SidebarTrigger } from '../../components/ui/sidebar';
import { NAV_LINKS } from '../../config/navLinks';

/**
 * Header de las páginas del template `default`: trigger del sidebar,
 * separador vertical y breadcrumb con la sección actual. Portado de
 * `app/projects/page.tsx` de devbout-ui/base.
 */
function sectionLabel(pathname: string): string {
  const exact = NAV_LINKS.find((link) => link.to === pathname);
  if (exact) return exact.label;

  const parent = NAV_LINKS.find((link) => pathname.startsWith(`${link.to}/`));
  if (parent) return parent.label;

  const segment = pathname.split('/').filter(Boolean)[0];
  return segment ? segment.charAt(0).toUpperCase() + segment.slice(1) : 'Inicio';
}

export function AdminHeader() {
  const { pathname } = useLocation();

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-vertical:h-4 data-vertical:self-auto"
        />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>{sectionLabel(pathname)}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  );
}
