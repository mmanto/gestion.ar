import * as React from "react"

export type SidebarContextProps = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

/**
 * Contexto y hook del sidebar, en su propio módulo: `sidebar.tsx` exporta sólo
 * componentes y así queda limpio para `react-refresh/only-export-components`
 * (el hook vive acá, que no exporta componentes).
 */
export const SidebarContext = React.createContext<SidebarContextProps | null>(null)

export function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }

  return context
}
