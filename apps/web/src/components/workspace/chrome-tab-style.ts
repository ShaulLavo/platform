import { cn } from '@workspace/ui/lib/utils'

export function chromeTabRootClassName({
  active,
  className,
}: {
  active: boolean
  className?: string
}) {
  return cn(
    'group group/chrome-tab relative flex items-center overflow-hidden border-x border-transparent bg-background/55 text-xs text-muted-foreground/70',
    'transition-[background-color,border-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]',
    active
      ? 'border-border bg-muted/85 text-foreground shadow-[inset_0_1px_0_var(--border)]'
      : 'hover:border-border/50 hover:bg-muted/45 hover:text-foreground/85',
    className,
  )
}
