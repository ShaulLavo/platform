import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import type { EditorTabCloseTarget } from '@/features/workspace/utils/tab-close-targets'
import type { EditorTabModel } from '@/features/workspace/utils/tab-types'
import { EditorTabButton } from '@/features/workbench/components/editor-tab-button'

export function SortableEditorTabButton({
  closeTargets,
  dirty,
  loading,
  tab,
}: {
  readonly closeTargets: readonly EditorTabCloseTarget[]
  readonly dirty: boolean
  readonly loading: boolean
  readonly tab: EditorTabModel
}) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    attributes: {
      role: 'tab',
      roleDescription: 'sortable editor tab',
    },
    id: tab.id,
  })

  return (
    <EditorTabButton
      closeTargets={closeTargets}
      dragAttributes={attributes}
      dragListeners={listeners}
      dirty={dirty}
      dragging={isDragging}
      dragNodeRef={setNodeRef}
      dragStyle={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      loading={loading}
      tab={tab}
    />
  )
}
