import { type MouseEvent, type RefObject } from 'react'

import { ChromeTabSelectButton } from '@/components/workspace/editor-tabs/components/chrome-tab-select-button'
import { ChromeTabTitle } from '@/components/workspace/editor-tabs/components/chrome-tab-title'
import { ChromeTabTrailingSlot } from '@/components/workspace/editor-tabs/components/chrome-tab-trailing-slot'
import { EditorTabContextMenuContent } from '@/components/workspace/editor-tabs/components/editor-tab-context-menu-content'
import {
  chromeTabStyle,
  fileIconStyle,
} from '@/components/workspace/editor-tabs/utils/editor-tab-style-utils'
import type {
  EditorChromeVisualTab,
  EditorTabModel,
} from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import type { EditorSplitDirection } from '@/components/workspace/editor-tabs/utils/editor-tab-model'
import type { RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import { WorkbenchChromeTab } from '@/features/workbench/components/chrome-tab'
import type { WorkbenchTabDragData } from '@/features/workbench/utils/drag-drop-data'
import { cn } from '@workspace/ui/lib/utils'

export function ChromeEditorTab({
  closedWidth,
  closeMode,
  closeTarget,
  dnd,
  index,
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
  onSelect,
}: {
  closedWidth: number
  closeMode: boolean
  closeTarget: boolean
  dnd: WorkbenchTabDragData
  index: number
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
  onSelect: (tab: EditorTabModel) => void
}) {
  const tab = visualTab.tab
  const style = chromeTabStyle(
    visualTab,
    index,
    overlap,
    layoutWidth,
    trailingSlotWidth,
    closedWidth,
  )
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

  return (
    <WorkbenchChromeTab
      active={tab.active}
      className={cn(closing && 'opacity-0')}
      contextMenuContent={
        <EditorTabContextMenuContent
          tab={tab}
          tabs={tabs}
          onCloseTabs={onCloseTabs}
          onSplit={onSplit}
        />
      }
      dnd={dnd}
      editorTabId={tab.id}
      editorTabPath={tab.path}
      phase={visualTab.phase}
      tabRef={tabRef}
      style={style}
      onClick={handleSelectClick}
      onClickCapture={handleClickCapture}
      onContextMenu={handleContextMenu}
    >
      <ChromeTabSelectButton
        aria-selected={tab.active}
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
    </WorkbenchChromeTab>
  )
}
