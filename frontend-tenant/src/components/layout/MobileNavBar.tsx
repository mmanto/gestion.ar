import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Settings,
} from 'lucide-react'

interface Tab {
  to: string
  label: string
  icon: React.ReactNode
}

const STAFF_TABS: Tab[] = [
  { to: '/dashboard', label: 'Inicio', icon: <LayoutDashboard className="h-5 w-5" /> },
  { to: '/conversations', label: 'Chats', icon: <MessageSquare className="h-5 w-5" /> },
  { to: '/clients', label: 'Clientes', icon: <Users className="h-5 w-5" /> },
  { to: '/settings', label: 'Ajustes', icon: <Settings className="h-5 w-5" /> },
]

/** Bottom tab navigation bar for the Staff mobile app. */
export function MobileNavBar() {
  const location = useLocation()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around
                 border-t border-gray-200 bg-white pb-safe dark:border-gray-800 dark:bg-gray-950"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0.5rem)' }}
    >
      {STAFF_TABS.map((tab) => {
        const isActive = location.pathname.startsWith(tab.to)
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={`flex flex-col items-center gap-0.5 px-3 py-2 text-xs font-medium transition-colors ${
              isActive
                ? 'text-[#2793b4]'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
