import {
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { useSortable } from '@dnd-kit/react/sortable'

import { chromeTabRootClassName } from '@/components/workspace/editor-tabs/utils/chrome-tab-style'
import {
  WORKBENCH_TAB_DRAG_TYPE,
  workbenchTabDragId,
  type WorkbenchTabDragData,
} from '@/features/workbench/utils/drag-drop-data'
import { useWorkbenchTabDragOffset } from '@/features/workbench/hooks/use-workbench-tab-drag-offset'
import { ContextMenu, ContextMenuTrigger } from '@workspace/ui/components/context-menu'
import { cn } from '@workspace/ui/lib/utils'

export function WorkbenchChromeTab({
  active,
  children,
  className,
  contextMenuContent,
  editorTabId,
  editorTabPath,
  phase,
  surfaceTabId,
  tabRef,
  style,
  dnd,
  onClick,
  onClickCapture,
  onContextMenu,
}: {
  readonly active: boolean
  readonly children: ReactNode
  readonly className?: string
  readonly contextMenuContent?: ReactNode
  readonly editorTabId?: string
  readonly editorTabPath?: string
  readonly phase?: string
  readonly surfaceTabId?: string
  readonly tabRef?: RefObject<HTMLDivElement | null>
  readonly style?: CSSProperties
  readonly dnd: WorkbenchTabDragData
  readonly onClick?: () => void
  readonly onClickCapture?: (event: MouseEvent<HTMLDivElement>) => void
  readonly onContextMenu?: (event: MouseEvent<HTMLDivElement>) => void
}) {
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const dragOffsetX = useWorkbenchTabDragOffset(dnd.surfaceId)
  const { handleRef, isDragging, ref } = useSortable<WorkbenchTabDragData>({
    accept: WORKBENCH_TAB_DRAG_TYPE,
    data: dnd,
    disabled: !dnd.capabilities.canDrag,
    group: dnd.stripId,
    id: workbenchTabDragId(dnd.stripId, dnd.surfaceId),
    index: dnd.sourceIndex,
    type: WORKBENCH_TAB_DRAG_TYPE,
  })

  function setRoot(element: HTMLDivElement | null) {
    ref(element)
    handleRef(element)
    assignTabRef(tabRef, element)
  }

  const rootClassName = chromeTabRootClassName({
    active,
    className: cn('cursor-pointer', 'z-[var(--chrome-tab-z)]', className),
  })
  const rootStyle = chromeTabDragStyle(style, dragOffsetX)

  if (!contextMenuContent) {
    return (
      <div
        className={rootClassName}
        data-chrome-tab-root=''
        data-editor-tab-id={editorTabId}
        data-editor-tab-path={editorTabPath}
        data-editor-tab-phase={phase}
        data-surface-tab-id={surfaceTabId}
        data-workbench-tab-dragging={isDragging ? 'true' : undefined}
        data-workbench-tab-id={dnd.surfaceId}
        draggable={false}
        ref={setRoot}
        style={rootStyle}
        onClick={onClick}
        onClickCapture={onClickCapture}
        onContextMenu={onContextMenu}
      >
        {children}
      </div>
    )
  }

  return (
    <ContextMenu open={contextMenuOpen} onOpenChange={setContextMenuOpen}>
      <ContextMenuTrigger
        className={rootClassName}
        data-chrome-tab-root=''
        data-editor-tab-id={editorTabId}
        data-editor-tab-path={editorTabPath}
        data-editor-tab-phase={phase}
        data-surface-tab-id={surfaceTabId}
        data-workbench-tab-dragging={isDragging ? 'true' : undefined}
        data-workbench-tab-id={dnd.surfaceId}
        draggable={false}
        ref={setRoot}
        style={rootStyle}
        onClick={onClick}
        onClickCapture={onClickCapture}
        onContextMenu={onContextMenu}
      >
        {children}
      </ContextMenuTrigger>
      {contextMenuOpen ? contextMenuContent : null}
    </ContextMenu>
  )
}

function assignTabRef(
  ref: RefObject<HTMLDivElement | null> | undefined,
  element: HTMLDivElement | null,
) {
  if (!ref) return

  ;(ref as { current: HTMLDivElement | null }).current = element
}

function chromeTabDragStyle(style: CSSProperties | undefined, offsetX: number) {
  if (offsetX === 0) return style

  return {
    ...style,
    '--chrome-tab-z': 50,
    transform: `translate3d(${Math.round(offsetX)}px, 0, 0)`,
    transition: 'none',
  } as CSSProperties
}
