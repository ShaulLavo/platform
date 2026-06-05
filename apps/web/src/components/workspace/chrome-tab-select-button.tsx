import type { ComponentPropsWithoutRef } from 'react'

import { cn } from '@workspace/ui/lib/utils'

export function ChromeTabSelectButton({
  children,
  className,
  type = 'button',
  ...buttonProps
}: ComponentPropsWithoutRef<'button'>) {
  return (
    <button
      className={cn(
        'focus-visible:ring-ring/50 flex h-full min-w-0 flex-1 items-center gap-1.5 py-0 pr-1.5 pl-3 text-left transition-colors outline-none focus-visible:ring-1',
        className,
      )}
      type={type}
      {...buttonProps}
    >
      {children}
    </button>
  )
}
