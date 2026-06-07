import {
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
  type RefObject,
} from 'react'

import { ChromeTabSelectButton } from '@/components/workspace/editor-tabs/components/chrome-tab-select-button'
import { chromeTabRootClassName } from '@/components/workspace/editor-tabs/utils/chrome-tab-style'
import { ChromeTabTitle } from '@/components/workspace/editor-tabs/components/chrome-tab-title'
import { ChromeTabTrailingSlot } from '@/components/workspace/editor-tabs/components/chrome-tab-trailing-slot'
import { EditorTabContextMenuContent } from '@/components/workspace/editor-tabs/components/editor-tab-context-menu-content'
import {
  chromeTabStyle,
  fileIconStyle,
  tabDragClassName,
} from '@/components/workspace/editor-tabs/utils/editor-tab-style-utils'
import type {
  EditorChromeVisualTab,
  EditorTabModel,
} from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import type {
  EditorTabDragController,
  EditorTabInsertionEdge,
} from '@/components/workspace/editor-tabs/hooks/use-editor-tab-drag'
import type { EditorSplitDirection } from '@/components/workspace/editor-tabs/utils/editor-tab-model'
import type { RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import { ContextMenu, ContextMenuTrigger } from '@workspace/ui/components/context-menu'
import { cn } from '@workspace/ui/lib/utils'

export function ChromeEditorTab({
  closedWidth,
  closeMode,
  closeTarget,
  dragOffsetX,
  dragged,
  index,
  insertionEdge,
  layoutWidth,
  overlap,
  tabs,
  tabRef,
  trailingSlotWidth,
  visualTab,
  onClose,
  onCloseClosingTab,
  onCloseTabs,
  onSplit,
  onDragEnd,
  onDragStart,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onSelect,
}: {
  closedWidth: number
  closeMode: boolean
  closeTarget: boolean
  dragOffsetX: number
  dragged: boolean
  index: number
  insertionEdge: EditorTabInsertionEdge
  layoutWidth: number | null
  overlap: number
  tabs: readonly EditorTabModel[]
  tabRef?: RefObject<HTMLDivElement | null>
  trailingSlotWidth: number
  visualTab: EditorChromeVisualTab
  onClose: (path: string) => void
  onCloseClosingTab: (tabId: string) => void
  onCloseTabs: RequestCloseTabs
  onSplit: (tabId: string, direction: EditorSplitDirection) => boolean
  onDragEnd: () => void
  onDragStart: EditorTabDragController['onDragStart']
  onPointerCancel: EditorTabDragController['onPointerCancel']
  onPointerDown: EditorTabDragController['onPointerDown']
  onPointerMove: EditorTabDragController['onPointerMove']
  onPointerUp: EditorTabDragController['onPointerUp']
  onSelect: (tab: EditorTabModel) => void
}) {
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const tab = visualTab.tab
  const tabStyle = chromeTabStyle(
    visualTab,
    index,
    overlap,
    layoutWidth,
    trailingSlotWidth,
    closedWidth,
  )
  const style = editorTabStyleWithDragOffset(tabStyle, dragOffsetX)
  const closing = visualTab.phase === 'closing'

  function handleClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!closing) return

    event.preventDefault()
    event.stopPropagation()
    onCloseClosingTab(tab.id)
  }

  function handleContextMenu(event: MouseEvent<HTMLDivElement>) {
    if (!closing) return

    event.preventDefault()
    event.stopPropagation()
  }

  function handleSelectClick() {
    if (closing) return

    onSelect(tab)
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    if (closing) {
      event.preventDefault()
      return
    }

    onDragStart(event, tab)
  }

  function handleSelectDragStart(event: DragEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (closing) {
      event.preventDefault()
      return
    }

    onDragStart(event, tab)
  }

  return (
    <ContextMenu open={contextMenuOpen} onOpenChange={setContextMenuOpen}>
      <ContextMenuTrigger
        className={chromeTabRootClassName({
          active: tab.active,
          className: cn(
            'cursor-pointer',
            'z-[var(--chrome-tab-z)]',
            closing && 'opacity-0',
            tabDragClassName(insertionEdge, dragged),
          ),
        })}
        data-chrome-tab-root=''
        data-editor-tab-id={tab.id}
        data-editor-tab-phase={visualTab.phase}
        data-editor-tab-path={tab.path}
        draggable={false}
        onClick={handleSelectClick}
        onClickCapture={handleClickCapture}
        onContextMenu={handleContextMenu}
        onDragEnd={onDragEnd}
        onDragStart={handleDragStart}
        onPointerCancel={onPointerCancel}
        onPointerDown={(event) => onPointerDown(event, tab)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        ref={tabRef}
        style={style}
      >
        <ChromeTabSelectButton
          aria-selected={tab.active}
          onDragEnd={onDragEnd}
          onDragStart={handleSelectDragStart}
          draggable={false}
          role='tab'
          title={tab.title}
        >
          <span
            aria-hidden='true'
            className='size-3.5 shrink-0 object-contain'
            style={fileIconStyle(tab.icon)}
          />
          <ChromeTabTitle tab={tab} />
        </ChromeTabSelectButton>
        <ChromeTabTrailingSlot
          closeMode={closeMode}
          forceVisible={closeTarget}
          tab={tab}
          width={trailingSlotWidth}
          onClose={onClose}
        />
      </ContextMenuTrigger>
      {contextMenuOpen ? (
        <EditorTabContextMenuContent
          tab={tab}
          tabs={tabs}
          onCloseTabs={onCloseTabs}
          onSplit={onSplit}
        />
      ) : null}
    </ContextMenu>
  )
}

function editorTabStyleWithDragOffset(style: CSSProperties, dragOffsetX: number) {
  if (dragOffsetX === 0) return style

  return {
    ...style,
    transform: `translate3d(${dragOffsetX}px, 0, 0)`,
    transition: 'none',
  } satisfies CSSProperties
}
