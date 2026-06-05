import { cn } from '@workspace/ui/lib/utils'

export function chromeTabRootClassName({
  active,
  className,
}: {
  active: boolean
  className?: string
}) {
  return cn(
    'group group/chrome-tab relative flex items-center overflow-hidden bg-transparent text-xs text-muted-foreground/70 outline-none focus-visible:outline-none',
    'transition-[background-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]',
    active ? 'bg-accent text-foreground' : 'hover:text-foreground/85',
    className,
  )
}
