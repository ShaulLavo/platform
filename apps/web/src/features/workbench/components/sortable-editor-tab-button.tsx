import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import type { EditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import { EditorTabButton } from '@/features/workbench/components/editor-tab-button'

export function SortableEditorTabButton({ tab }: { readonly tab: EditorTabModel }) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    attributes: {
      role: 'tab',
      roleDescription: 'sortable editor tab',
    },
    id: tab.id,
  })

  return (
    <EditorTabButton
      dragAttributes={attributes}
      dragListeners={listeners}
      dragging={isDragging}
      dragNodeRef={setNodeRef}
      dragStyle={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      tab={tab}
    />
  )
}
