import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import { useCallback, type CSSProperties, type Ref } from 'react'

import { useEditorTabIntentPrefetch } from '@/components/workspace/editor-tabs/hooks/use-editor-tab-intent-prefetch'
import { useEditorTabDirty } from '@/components/workspace/editor-tabs/hooks/use-editor-tab-dirty'
import type { EditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import { useEditorTabActions } from '@/features/editor/hooks/use-editor-tab-actions'
import { TabTrailingSlot } from '@/features/workbench/components/tab-trailing-slot'
import { fileIconStyle } from '@/lib/file-icon-style'
import { cn } from '@workspace/ui/lib/utils'

export function EditorTabButton({
  dragAttributes,
  dragListeners,
  dragging = false,
  dragNodeRef,
  dragStyle,
  tab,
}: {
  readonly dragAttributes?: DraggableAttributes
  readonly dragListeners?: DraggableSyntheticListeners
  readonly dragging?: boolean
  readonly dragNodeRef?: Ref<HTMLButtonElement>
  readonly dragStyle?: CSSProperties
  readonly tab: EditorTabModel
}) {
  const dirty = useEditorTabDirty(tab.path)
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

  return (
    <button
      {...dragAttributes}
      {...dragListeners}
      aria-selected={tab.active}
      className={cn(
        'group/proof-tab flex h-9 w-36 min-w-24 max-w-48 shrink-0 cursor-grab touch-none items-center gap-1.5 rounded-t-md border px-2 text-left text-xs shadow-sm outline-none transition-[background-color,border-color,opacity,box-shadow] active:cursor-grabbing focus-visible:ring-1 focus-visible:ring-ring/50',
        tab.active ? 'border-border text-foreground' : 'border-transparent text-muted-foreground',
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
      <span className='min-w-0 shrink truncate'>{tab.name}</span>
      {tab.diffSuffix ? (
        <span
          aria-hidden='true'
          className={cn(
            'shrink-0 text-xs leading-none font-semibold tabular-nums',
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
