import { use, type DragEvent } from 'react'
import type { IDockviewPanelHeaderProps } from 'dockview-react'

import { ChromeTabSelectButton } from '@/components/workspace/editor-tabs/components/chrome-tab-select-button'
import { chromeTabRootClassName } from '@/components/workspace/editor-tabs/utils/chrome-tab-style'
import { ChromeTabTitle } from '@/components/workspace/editor-tabs/components/chrome-tab-title'
import { ChromeTabTrailingSlot } from '@/components/workspace/editor-tabs/components/chrome-tab-trailing-slot'
import {
  fileIconStyle,
  tabDragClassName,
} from '@/components/workspace/editor-tabs/utils/editor-tab-style-utils'
import { editorTabInsertionEdge } from '@/components/workspace/editor-tabs/hooks/use-editor-tab-drag'
import { cn } from '@workspace/ui/lib/utils'

import { useDockviewPanelActive } from './use-dockview-panel-active'
import { WorkbenchDockviewContext } from './workbench-dockview-context'
import type { WorkbenchDockviewPanelParams } from './workbench-dockview-model'
import { workbenchDockviewEditorTabModel } from './workbench-dockview-tab-model'

export function WorkbenchDockviewTab(
  props: IDockviewPanelHeaderProps<WorkbenchDockviewPanelParams>,
) {
  const context = use(WorkbenchDockviewContext)
  const record = context?.recordsById.get(props.params.panel.id) ?? null
  const active = useDockviewPanelActive(props.api)

  function handleClose() {
    if (!record) {
      props.api.close()
      return
    }

    context?.requestCloseTab(record.tabId)
  }

  function handleCloseSlot() {
    handleClose()
  }

  if (!context || !record) {
    return (
      <button
        className='workbench-dockview-tab text-muted-foreground flex h-full w-full min-w-0 items-center px-3 text-xs'
        type='button'
        onClick={() => props.api.setActive()}
      >
        <span className='min-w-0 truncate'>{props.api.title ?? props.params.panel.id}</span>
      </button>
    )
  }

  const tab = workbenchDockviewEditorTabModel({
    active,
    context,
    record,
  })
  const drag = context.chromeTabDrag
  const insertionEdge = drag
    ? editorTabInsertionEdge(drag.tabs, { id: tab.id, path: tab.path }, drag.controller.state)
    : null
  const dragged = drag?.controller.draggedTabId === tab.id

  return (
    <div
      className={chromeTabRootClassName({
        active,
        className: cn(
          'workbench-dockview-tab h-full w-full min-w-0',
          drag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
          tabDragClassName(insertionEdge, dragged),
          props.tabLocation === 'headerOverflow' && 'min-h-8',
        ),
      })}
      data-chrome-tab-root=''
      data-dockview-tab-location={props.tabLocation}
      data-editor-tab-id={tab.id}
      data-editor-tab-path={tab.path}
      draggable={Boolean(drag)}
      onDragEndCapture={(event) => handleDragEndCapture(event)}
      onDragStartCapture={(event) => handleDragStartCapture(event)}
    >
      <ChromeTabSelectButton
        aria-selected={active}
        draggable={Boolean(drag)}
        role='tab'
        title={tab.title}
        onClick={() => props.api.setActive()}
      >
        <span
          aria-hidden='true'
          className='size-3.5 shrink-0 object-contain'
          style={fileIconStyle(tab.icon)}
        />
        <ChromeTabTitle tab={tab} />
      </ChromeTabSelectButton>
      <ChromeTabTrailingSlot tab={tab} width={active ? 28 : 0} onClose={handleCloseSlot} />
    </div>
  )

  function handleDragStart(event: DragEvent<HTMLElement>) {
    if (!drag) return

    drag.setTabListElement(event.currentTarget.closest<HTMLDivElement>('.dv-tabs-container'))
    drag.controller.onDragStart(event, { id: tab.id, path: tab.path })
  }

  function handleDragStartCapture(event: DragEvent<HTMLElement>) {
    if (!drag) return

    event.stopPropagation()
    handleDragStart(event)
  }

  function handleDragEndCapture(event: DragEvent<HTMLElement>) {
    if (!drag) return

    event.stopPropagation()
    drag.controller.onDragEnd()
  }
}
