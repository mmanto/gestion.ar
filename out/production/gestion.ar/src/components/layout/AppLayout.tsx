import type { ReactNode } from 'react'
import { useTemplate } from '../../hooks/useTemplate'
import { TEMPLATE_MAP } from '../../templates/registry'
import { MobileShell } from './MobileShell'

declare const __TARGET__: 'staff' | 'client'

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const { templateId } = useTemplate()

  // Staff mobile app: bottom tabs instead of sidebar
  if (__TARGET__ === 'staff') {
    return <MobileShell>{children}</MobileShell>
  }

  // Web/PWA: template-based layout (sidebar + navbar)
  const Template = TEMPLATE_MAP[templateId].AppLayout
  return <Template>{children}</Template>
}
