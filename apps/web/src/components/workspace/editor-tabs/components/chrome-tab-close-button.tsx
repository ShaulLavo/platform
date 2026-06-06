import { XIcon } from '@phosphor-icons/react'
import type { ComponentPropsWithoutRef } from 'react'

import { cn } from '@workspace/ui/lib/utils'

export function ChromeTabCloseButton({
  children,
  className,
  type = 'button',
  ...buttonProps
}: ComponentPropsWithoutRef<'button'>) {
  return (
    <button
      className={cn(
        'group/close flex size-6 shrink-0 cursor-default items-center justify-center rounded-[5px] text-muted-foreground outline-none',
        'transition-[background-color,color,opacity,transform] duration-75 ease-[cubic-bezier(0.23,1,0.32,1)]',
        'hover:bg-muted hover:text-foreground active:scale-[0.97] focus-visible:ring-1 focus-visible:ring-ring/50',
        className,
      )}
      type={type}
      {...buttonProps}
    >
      {children ?? <XIcon className='size-3 opacity-70' />}
    </button>
  )
}
