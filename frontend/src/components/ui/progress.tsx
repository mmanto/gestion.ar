import * as React from "react"

import { cn } from "../../lib/utils"

function Progress({
  value = 0,
  max = 100,
  className,
  indicatorClassName,
  ...props
}: React.ComponentProps<"div"> & {
  value?: number
  max?: number
  /** Classes of the filled part — use it to color the bar by state. */
  indicatorClassName?: string
}) {
  const percentage = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className={cn("h-full rounded-full bg-primary", indicatorClassName)}
        style={{ width: `${percentage}%` }}
      />
    </div>
  )
}

export { Progress }
