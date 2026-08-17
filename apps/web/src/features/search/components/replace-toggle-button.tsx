import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'

type SearchReplaceToggleButtonProps = {
  active: boolean
  className?: string
  onToggle: (active: boolean) => void
}

export function SearchReplaceToggleButton({
  active,
  className,
  onToggle,
}: SearchReplaceToggleButtonProps) {
  return (
    <Button
      aria-pressed={active}
      className={cn(
        'h-8 shrink-0 px-2 text-[11px] text-muted-foreground hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground',
        className,
      )}
      size='sm'
      title='Toggle replace'
      type='button'
      variant='ghost'
      onClick={() => onToggle(!active)}
    >
      Replace
    </Button>
  )
}
