import { Button } from '@workspace/ui/components/button'
import type { ReactNode } from 'react'

export function WorkspaceActivityButton({
  controls,
  expanded,
  icon,
  label,
  onClick,
}: {
  controls?: string
  expanded?: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <Button
      aria-controls={controls}
      aria-expanded={expanded}
      aria-label={label}
      className='text-muted-foreground hover:bg-muted/50 aria-expanded:text-muted-foreground aria-expanded:hover:bg-muted/50 aria-expanded:hover:text-foreground size-8 rounded-md p-0 aria-expanded:bg-transparent'
      size='icon'
      title={label}
      type='button'
      variant='ghost'
      onClick={onClick}
    >
      {icon}
      <span className='sr-only'>{label}</span>
    </Button>
  )
}
