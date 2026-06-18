import { cn } from '@workspace/ui/lib/utils'

export function PanelShell({
  className,
  label,
  tone = 'muted',
}: {
  className?: string
  label: string
  tone?: 'error' | 'muted'
}) {
  return (
    <section
      className={cn(
        'h-full min-h-0 px-4 py-3 text-xs',
        tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
        className,
      )}
    >
      {label}
    </section>
  )
}
