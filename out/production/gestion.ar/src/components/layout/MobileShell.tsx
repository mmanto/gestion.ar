import type { ReactNode } from 'react'
import { MobileNavBar } from './MobileNavBar'

interface MobileShellProps {
  children: ReactNode
}

/**
 * Mobile app shell: full-height layout with bottom tab navigation.
 * Wraps page content with safe-area aware padding for native status bars
 * and the bottom tab bar.
 */
export function MobileShell({ children }: MobileShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-gray-50 dark:bg-gray-950">
      {/* Status bar safe area (iOS notch / Android punch-hole) */}
      <div
        className="shrink-0 bg-[#2793b4]"
        style={{ height: 'env(safe-area-inset-top, 0px)' }}
      />

      {/* Page content — scrollable, padded for bottom tabs */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom tab navigation */}
      <MobileNavBar />
    </div>
  )
}
