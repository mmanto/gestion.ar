import { Link, useNavigate } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  LogoutIcon,
  PaletteIcon,
  Settings05Icon,
  UnfoldMoreIcon,
} from '@hugeicons/core-free-icons';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '../../components/ui/sidebar';
import { useSidebar } from '../../components/ui/sidebar-context';
import { TemplatePicker } from '../../components/layout/TemplatePicker';
import { useAuth } from '../../hooks/useAuth';

/**
 * Bloque de usuario del sidebar, adaptado de `components/nav-user.tsx` de
 * devbout-ui/base. El selector de template (`TemplatePicker`, «Diseño») sigue
 * viviendo dentro de este dropdown.
 */
export function NavUser() {
  const { user, logout } = useAuth();
  const { isMobile } = useSidebar();
  const navigate = useNavigate();

  const fullName =
    [user?.nombre, user?.apellido].filter(Boolean).join(' ') ||
    user?.username ||
    'Usuario';
  const contact = user?.email || user?.username || '';
  const initial = (user?.nombre || user?.username || 'U').charAt(0).toUpperCase();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />
            }
          >
            <Avatar>
              {user?.avatar_url ? (
                <AvatarImage src={user.avatar_url} alt={fullName} />
              ) : null}
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{fullName}</span>
              <span className="truncate text-xs">{contact}</span>
            </div>
            <HugeiconsIcon
              icon={UnfoldMoreIcon}
              strokeWidth={2}
              className="ml-auto size-4"
            />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-fit"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar>
                    {user?.avatar_url ? (
                      <AvatarImage src={user.avatar_url} alt={fullName} />
                    ) : null}
                    <AvatarFallback>{initial}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{fullName}</span>
                    <span className="truncate text-xs">{contact}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <TemplatePicker />

            <DropdownMenuSeparator />

            <DropdownMenuItem render={<Link to="/settings" />}>
              <HugeiconsIcon icon={Settings05Icon} strokeWidth={2} />
              Ajustes
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link to="/apariencia" />}>
              <HugeiconsIcon icon={PaletteIcon} strokeWidth={2} />
              Apariencia
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={handleLogout}>
              <HugeiconsIcon icon={LogoutIcon} strokeWidth={2} />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
