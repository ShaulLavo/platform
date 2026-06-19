import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers'
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'

import type { EditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import { useEditorTabActions } from '@/features/editor/hooks/use-editor-tab-actions'
import { SortableEditorTabButton } from '@/features/workbench/components/sortable-editor-tab-button'
import { editorTabReorderIntent } from '@/features/workbench/utils/editor-tab-dnd'

const EDITOR_TAB_DND_MODIFIERS = [restrictToHorizontalAxis]

export function EditorTabBar({ tabs }: { readonly tabs: readonly EditorTabModel[] }) {
  const { reorderTab } = useEditorTabActions()
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const intent = editorTabReorderIntent(tabs, event.active.id, event.over?.id)
    if (!intent) return

    reorderTab(intent.tabId, intent.targetIndex)
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      modifiers={EDITOR_TAB_DND_MODIFIERS}
      sensors={sensors}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={tabs.map((tab) => tab.id)} strategy={horizontalListSortingStrategy}>
        <div
          aria-label='Editor tabs'
          className='border-border flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b px-2 pt-1'
          role='tablist'
        >
          {tabs.map((tab) => {
            return <SortableEditorTabButton key={tab.id} tab={tab} />
          })}
        </div>
      </SortableContext>
    </DndContext>
  )
}
