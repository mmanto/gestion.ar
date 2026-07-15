import type { ReactNode } from 'react'
import { useTemplate } from '../../hooks/useTemplate'
import { TEMPLATE_MAP } from '../../templates/registry'
import { MobileShell } from './MobileShell'

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const { templateId } = useTemplate()

  // App nativa (Capacitor): bottom tabs en vez de sidebar
  if (__CAPACITOR__) {
    return <MobileShell>{children}</MobileShell>
  }

  // Web/PWA: layout basado en template (sidebar + navbar)
  const Template = TEMPLATE_MAP[templateId].AppLayout
  return <Template>{children}</Template>
}
