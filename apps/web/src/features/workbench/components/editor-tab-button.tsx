import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import { useCallback, type CSSProperties, type Ref } from 'react'

import { useEditorTabIntentPrefetch } from '@/features/workspace/hooks/use-tab-intent-prefetch'
import type { EditorTabCloseTarget } from '@/features/workspace/utils/tab-close-targets'
import type { EditorTabModel } from '@/features/workspace/utils/tab-types'
import { useEditorTabActions } from '@/features/editor/hooks/use-editor-tab-actions'
import { EditorTabMenu } from '@/features/workbench/components/editor-tab-menu'
import { TabTrailingSlot } from '@/features/workbench/components/tab-trailing-slot'
import { fileIconStyle } from '@/lib/file-icon-style'
import { cn } from '@workspace/ui/lib/utils'

export function EditorTabButton({
  closeTargets,
  dirty,
  dragAttributes,
  dragListeners,
  dragging = false,
  dragNodeRef,
  dragStyle,
  tab,
}: {
  readonly closeTargets: readonly EditorTabCloseTarget[]
  readonly dirty: boolean
  readonly dragAttributes?: DraggableAttributes
  readonly dragListeners?: DraggableSyntheticListeners
  readonly dragging?: boolean
  readonly dragNodeRef?: Ref<HTMLButtonElement>
  readonly dragStyle?: CSSProperties
  readonly tab: EditorTabModel
}) {
  const intentPrefetchRef = useEditorTabIntentPrefetch(tab)
  const { requestCloseTab, selectTab } = useEditorTabActions()
  // Stable ref composition keeps Foresight and DnD from re-registering on every render.
  const buttonRef = useCallback(
    (node: HTMLButtonElement | null) => {
      intentPrefetchRef(node)
      assignRef(dragNodeRef, node)
    },
    [dragNodeRef, intentPrefetchRef],
  )

  function handleSelectTab() {
    selectTab(tab.id)
  }

  function closeTab() {
    requestCloseTab(tab.id)
  }

  const trigger = (
    <button
      {...dragAttributes}
      {...dragListeners}
      aria-selected={tab.active}
      className={cn(
        'group/proof-tab flex h-9 w-36 min-w-24 max-w-48 shrink-0 cursor-grab touch-none items-center gap-1.5 rounded-t-md border px-2 text-left text-xs outline-none transition-[background-color,border-color,opacity,box-shadow] active:cursor-grabbing focus-visible:ring-1 focus-visible:ring-ring/50 compact:h-8 compact:gap-1 compact:px-1.5',
        tab.active
          ? 'border-border bg-background-solid text-foreground shadow-sm'
          : 'border-transparent text-muted-foreground shadow-none hover:bg-accent hover:text-accent-foreground',
        dragging && 'relative z-10 opacity-60',
      )}
      data-editor-tab-id={tab.id}
      data-editor-tab-path={tab.path}
      draggable={false}
      ref={buttonRef}
      role='tab'
      style={dragStyle}
      title={tab.title}
      type='button'
      onClick={handleSelectTab}
    >
      <span
        aria-hidden='true'
        className='size-3.5 shrink-0 object-contain'
        style={fileIconStyle(tab.icon)}
      />
      {editorTabTitle(tab)}
      <TabTrailingSlot
        active={tab.active}
        dirty={dirty}
        orientation='horizontal'
        title={tab.title}
        onClose={closeTab}
      />
    </button>
  )

  return <EditorTabMenu closeTargets={closeTargets} tab={tab} trigger={trigger} />
}

function assignRef<TElement>(ref: Ref<TElement> | undefined, node: TElement | null) {
  if (!ref) return
  if (typeof ref === 'function') {
    ref(node)
    return
  }

  ref.current = node
}

function editorTabTitle(tab: EditorTabModel) {
  return (
    <span className='flex min-w-0 flex-1 items-baseline gap-1 overflow-hidden whitespace-nowrap'>
      <span className='min-w-0 flex-1 truncate'>{tab.name}</span>
      {tab.diffSuffix ? (
        <span
          aria-hidden='true'
          className={cn(
            // Yields space before the filename does: a tab is 144px wide and
            // `(b25d374 *M)` alone nearly fills it, so a `shrink-0` suffix
            // truncated the name away entirely.
            'min-w-0 shrink truncate text-xs leading-none font-semibold tabular-nums',
            tab.diffStatus?.className ?? 'text-muted-foreground',
          )}
          title={tab.diffStatus?.title}
        >
          {tab.diffSuffix}
        </span>
      ) : null}
    </span>
  )
}
