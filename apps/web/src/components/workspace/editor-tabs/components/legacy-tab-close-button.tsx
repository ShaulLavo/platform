import { XIcon } from '@phosphor-icons/react'

import type { EditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import { useEditorTabDirty } from '@/components/workspace/editor-tabs/hooks/use-editor-tab-dirty'
import type { RequestCloseTab } from '@/features/editor/hooks/use-dirty-tab-close'
import { cn } from '@workspace/ui/lib/utils'

export function LegacyTabCloseButton({
  tab,
  onClose,
}: {
  tab: EditorTabModel
  onClose: RequestCloseTab
}) {
  const dirty = useEditorTabDirty(tab.path)
  const showCloseIcon = tab.active && !dirty

  return (
    <button
      aria-label={`Close ${tab.name}`}
      className={cn(
        'group/close relative mr-1 flex size-6 shrink-0 items-center justify-center text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50',
        showCloseIcon || dirty
          ? 'opacity-100'
          : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
      )}
      data-editor-tab-drag-blocker=''
      draggable={false}
      onClick={() => onClose(tab.id)}
      onDragStart={(event) => event.preventDefault()}
      title={`Close ${tab.name}`}
      type='button'
    >
      <XIcon
        className={cn(
          'size-3 transition-opacity',
          showCloseIcon
            ? 'opacity-70'
            : 'opacity-0 group-hover:opacity-70 group-focus-visible/close:opacity-70',
        )}
      />
      {dirty ? (
        <span
          aria-hidden='true'
          className='absolute size-2 rounded-full bg-amber-500 transition-opacity group-hover:opacity-0 group-focus-visible/close:opacity-0'
        />
      ) : null}
    </button>
  )
}
