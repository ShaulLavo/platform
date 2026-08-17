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

import type { EditorTabModel } from '@/features/workspace/utils/tab-types'
import { useEditorDocumentState } from '@/features/editor/state/document-state'
import type { EditorTabCloseTarget } from '@/features/workspace/utils/tab-close-targets'
import { useEditorTabActions } from '@/features/editor/hooks/use-editor-tab-actions'
import { SortableEditorTabButton } from '@/features/workbench/components/sortable-editor-tab-button'
import { useActiveTabStripScroll } from '@/features/workbench/hooks/use-active-tab-strip-scroll'
import { editorTabReorderIntent } from '@/features/workbench/utils/editor-tab-dnd'

const EDITOR_TAB_DND_MODIFIERS = [restrictToHorizontalAxis]

export function EditorTabBar({ tabs }: { readonly tabs: readonly EditorTabModel[] }) {
  const dirtyFilePaths = useEditorDocumentState((state) => state.dirtyFilePaths)
  const { reorderTab } = useEditorTabActions()
  const closeTargets = editorTabCloseTargets(tabs, dirtyFilePaths)
  const stripRef = useActiveTabStripScroll(tabs.find((tab) => tab.active)?.id ?? null)
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
          className='no-scrollbar border-border flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b px-2 pt-1'
          ref={stripRef}
          role='tablist'
        >
          {tabs.map((tab) => {
            return (
              <SortableEditorTabButton
                closeTargets={closeTargets}
                dirty={dirtyFilePaths.has(tab.path)}
                key={tab.id}
                tab={tab}
              />
            )
          })}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function editorTabCloseTargets(
  tabs: readonly EditorTabModel[],
  dirtyFilePaths: ReadonlySet<string>,
): EditorTabCloseTarget[] {
  return tabs.map((tab) => ({
    dirty: dirtyFilePaths.has(tab.path),
    id: tab.id,
    path: tab.path,
  }))
}
