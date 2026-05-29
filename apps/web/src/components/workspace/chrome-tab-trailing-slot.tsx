import { XIcon } from '@phosphor-icons/react'

import {
  chromeTabCloseButtonVisibilityClassName,
  chromeTabRootWidth,
  chromeTabTrailingSlotStyle,
} from '@/components/workspace/editor-tab-style-utils'
import type { EditorTabModel } from '@/components/workspace/editor-tab-types'
import { useEditorTabDirty } from '@/components/workspace/use-editor-tab-dirty'
import { cn } from '@workspace/ui/lib/utils'

export function ChromeTabTrailingSlot({
  tab,
  width,
  onClose,
}: {
  tab: EditorTabModel
  width: number
  onClose: (path: string, width: number | null) => void
}) {
  const dirty = useEditorTabDirty(tab.path)

  return (
    <div
      className={cn(
        'relative flex h-full max-w-0 min-w-0 shrink-0 items-center justify-center overflow-hidden',
        'w-0 group-focus-within/chrome-tab:max-w-[var(--chrome-tab-trailing-slot-width)] group-focus-within/chrome-tab:min-w-[var(--chrome-tab-trailing-slot-width)] group-focus-within/chrome-tab:w-[var(--chrome-tab-trailing-slot-width)]',
        'group-hover/chrome-tab:max-w-[var(--chrome-tab-trailing-slot-width)] group-hover/chrome-tab:min-w-[var(--chrome-tab-trailing-slot-width)] group-hover/chrome-tab:w-[var(--chrome-tab-trailing-slot-width)]',
        dirty &&
          'max-w-[var(--chrome-tab-trailing-slot-width)] min-w-[var(--chrome-tab-trailing-slot-width)] w-[var(--chrome-tab-trailing-slot-width)]',
        width > 0 &&
          'max-w-[var(--chrome-tab-trailing-slot-width)] min-w-[var(--chrome-tab-trailing-slot-width)] w-[var(--chrome-tab-trailing-slot-width)]',
      )}
      style={chromeTabTrailingSlotStyle()}
    >
      <button
        aria-label={`Close ${tab.name}`}
        className={cn(
          'group/close flex size-6 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-[background-color,color,opacity] outline-none hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50',
          chromeTabCloseButtonVisibilityClassName(tab, dirty),
        )}
        data-editor-tab-drag-blocker=''
        draggable={false}
        onClick={(event) => {
          event.stopPropagation()
          onClose(tab.id, chromeTabRootWidth(event.currentTarget))
        }}
        onDragStart={(event) => event.preventDefault()}
        title={`Close ${tab.name}`}
        type='button'
      >
        <XIcon className='size-3 opacity-70' />
      </button>
      {dirty ? (
        <span
          aria-hidden='true'
          className={cn(
            'pointer-events-none absolute size-2 rounded-full bg-amber-500 transition-opacity',
            'opacity-100 group-focus-within/chrome-tab:opacity-0 group-hover/chrome-tab:opacity-0',
          )}
        />
      ) : null}
    </div>
  )
}
