import type { ReactNode } from 'react'

import { Button } from '@workspace/ui/components/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@workspace/ui/components/tooltip'

export function WindowControlButton({
  children,
  disabled = false,
  label,
  onClick,
}: {
  readonly children: ReactNode
  readonly disabled?: boolean
  readonly label: string
  readonly onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className='text-muted-foreground hover:text-foreground size-7 rounded-md'
            disabled={disabled}
            size='icon-sm'
            title={label}
            type='button'
            variant='ghost'
            onClick={onClick}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
