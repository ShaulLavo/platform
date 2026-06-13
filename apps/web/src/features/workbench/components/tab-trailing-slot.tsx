import { XIcon } from '@phosphor-icons/react'

import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'

export function TabTrailingSlot({
  active,
  canClose,
  dirty,
  forceVisible,
  orientation,
  title,
  onClose,
}: {
  readonly active: boolean
  readonly canClose: boolean
  readonly dirty: boolean
  readonly forceVisible: boolean
  readonly orientation: 'horizontal' | 'vertical'
  readonly title: string
  readonly onClose: () => void
}) {
  return (
    <span
      className={cn(
        'relative grid size-5 shrink-0 place-items-center',
        orientation === 'vertical' && 'mt-1',
      )}
    >
      <Button
        aria-label={`Close ${title}`}
        className={cn('size-5', closeButtonVisibilityClassName({ active, dirty, forceVisible }))}
        disabled={!canClose}
        draggable={false}
        size='icon-xs'
        type='button'
        variant='ghost'
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <XIcon className='size-3' />
      </Button>
      {dirty && !forceVisible ? (
        <span
          aria-hidden='true'
          className={cn(
            'pointer-events-none absolute size-2 rounded-full bg-warning transition-opacity',
            'opacity-100 group-focus-within/proof-tab:opacity-0 group-hover/proof-tab:opacity-0',
          )}
          data-workbench-tab-dirty-indicator=''
        />
      ) : null}
    </span>
  )
}

function closeButtonVisibilityClassName({
  active,
  dirty,
  forceVisible,
}: {
  readonly active: boolean
  readonly dirty: boolean
  readonly forceVisible: boolean
}) {
  if (forceVisible) return 'opacity-100'
  if (active && !dirty) return 'opacity-100'

  return 'pointer-events-none opacity-0 group-focus-within/proof-tab:pointer-events-auto group-focus-within/proof-tab:opacity-100 group-hover/proof-tab:pointer-events-auto group-hover/proof-tab:opacity-100'
}
