import { cn } from '@workspace/ui/lib/utils'
import { SpinnerIcon } from '@phosphor-icons/react'

type SpinnerProps = Omit<React.ComponentProps<'svg'>, 'ref'>

function Spinner({ className, ...props }: SpinnerProps) {
  return (
    <SpinnerIcon
      role='status'
      aria-label='Loading'
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  )
}

export { Spinner }
