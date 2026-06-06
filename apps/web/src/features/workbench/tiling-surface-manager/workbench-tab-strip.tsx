import { use, useMemo, useRef } from 'react'

import { ChromeEditorTabList } from '@/components/workspace/editor-tabs/components/chrome-editor-tab-list'
import { ChromeTabCloseButton } from '@/components/workspace/editor-tabs/components/chrome-tab-close-button'
import { chromeTabLayout } from '@/components/workspace/editor-tabs/utils/chrome-tab-layout'
import { ChromeTabSelectButton } from '@/components/workspace/editor-tabs/components/chrome-tab-select-button'
import { chromeTabRootClassName } from '@/components/workspace/editor-tabs/utils/chrome-tab-style'
import { sameEditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-model'
import { useChromeVisualTabs } from '@/components/workspace/editor-tabs/hooks/use-chrome-visual-tabs'
import { useElementWidth } from '@/components/workspace/shared/hooks/use-element-width'
import { useEditorTabDrag } from '@/components/workspace/editor-tabs/hooks/use-editor-tab-drag'
import { cn } from '@workspace/ui/lib/utils'

import { surfacePanelId } from './workbench-surface-host'
import { WorkbenchSurfaceIcon } from './workbench-surface-icon'
import {
  editorPaneIdForWorkbenchWindowId,
  editorSurfaceSerializedState,
} from './workbench-editor-surface-layout'
import { WorkbenchEditorSurfaceContext } from './workbench-editor-surface-context'
import { workbenchChromeTabStyle } from './workbench-tab-style'
import type { LayoutOperation, Surface, WorkbenchWindow } from './layout-types'

export function WorkbenchTabStrip({
  surfaces,
  window,
  onDispatch,
}: {
  readonly surfaces: readonly Surface[]
  readonly window: WorkbenchWindow
  readonly onDispatch: (operation: LayoutOperation) => void
}) {
  const tabListRef = useRef<HTMLDivElement | null>(null)
  const selectedTabRef = useRef<HTMLDivElement | null>(null)
  const editorSurfaceContext = use(WorkbenchEditorSurfaceContext)
  // useChromeVisualTabs uses tab array identity to decide whether to dispatch a sync.
  const editorTabs = useMemo(
    () =>
      editorSurfaceContext?.tabModelForSurface
        ? surfaces.flatMap((surface) => {
            const tab = editorSurfaceContext.tabModelForSurface(
              surface,
              surface.id === window.activeSurfaceId,
            )
            if (!tab) return []

            return [tab]
          })
        : [],
    [editorSurfaceContext, surfaces, window.activeSurfaceId],
  )
  const visualTabs = useChromeVisualTabs(
    editorTabs,
    Boolean(editorSurfaceContext),
    sameEditorTabModel,
  )
  const tabDrag = useEditorTabDrag({
    paneId: editorPaneIdForWorkbenchWindowId(window.id) ?? String(window.id),
    tabs: editorTabs,
    tabListRef,
    onMoveToPane: (tabId, targetIndex) => moveSurfaceTab(tabId, targetIndex),
    onReorder: (tabId, targetIndex) => reorderSurfaceTab(tabId, targetIndex),
  })
  const availableWidth = useElementWidth(tabListRef)
  const activeIndex = surfaces.findIndex((surface) => surface.id === window.activeSurfaceId)
  const layout =
    availableWidth === null
      ? null
      : chromeTabLayout({
          activeIndex,
          availableWidth,
          tabCount: surfaces.length,
        })

  if (editorSurfaceContext && visualTabs.length === surfaces.length && visualTabs.length > 0) {
    return (
      <div
        aria-label='Window tabs'
        className='flex min-h-0 min-w-0 flex-1 items-end overflow-hidden'
        ref={tabListRef}
        role='tablist'
      >
        <ChromeEditorTabList
          drag={tabDrag}
          selectedTabRef={selectedTabRef}
          tabListRef={tabListRef}
          tabs={visualTabs}
          onClose={editorSurfaceContext.requestCloseTab}
          onCloseTabs={editorSurfaceContext.requestCloseTabs}
          onSelect={selectEditorTab}
          onSplit={splitEditorTab}
        />
      </div>
    )
  }

  return (
    <div
      aria-label='Window tabs'
      className='flex min-h-0 min-w-0 flex-1 items-end overflow-hidden'
      ref={tabListRef}
      role='tablist'
    >
      <div className='flex min-w-full items-end overflow-visible'>
        {surfaces.map((surface, index) => {
          const active = surface.id === window.activeSurfaceId

          return (
            <div
              className={chromeTabRootClassName({
                active,
                className: cn(
                  'z-[var(--chrome-tab-z)] border border-transparent',
                  active && 'border-border/60 shadow-sm',
                ),
              })}
              data-chrome-tab-root=''
              data-surface-tab-id={surface.id}
              key={surface.id}
              style={workbenchChromeTabStyle({
                active,
                index,
                overlap: layout?.overlap ?? 0,
                width: layout?.tabs[index]?.width ?? null,
              })}
            >
              <ChromeTabSelectButton
                aria-controls={surfacePanelId(surface.id)}
                aria-selected={active}
                role='tab'
                title={surface.title}
                onClick={() => onDispatch(selectSurfaceOperation(window, surface))}
              >
                <WorkbenchSurfaceIcon className='size-3.5 shrink-0' type={surface.type} />
                <span className='min-w-0 truncate'>{surface.title}</span>
              </ChromeTabSelectButton>
              <div className='flex h-full w-7 shrink-0 items-center justify-center'>
                <ChromeTabCloseButton
                  aria-label={`Close ${surface.title} tab`}
                  className={cn(
                    'size-5 opacity-0 group-focus-within/chrome-tab:opacity-100 group-hover/chrome-tab:opacity-100',
                    active && 'opacity-100',
                    !surface.capabilities.canClose && 'pointer-events-none opacity-30',
                  )}
                  disabled={!surface.capabilities.canClose}
                  title={`Close ${surface.title} tab`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onDispatch({ surfaceId: surface.id, type: 'closeSurface' })
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  function moveSurfaceTab(tabId: string, targetIndex: number) {
    const surfaceId = editorSurfaceContext?.surfaceIdForEditorTabId(tabId)
    if (!surfaceId) return false

    onDispatch({
      index: targetIndex,
      surfaceId,
      targetWindowId: window.id,
      type: 'tabSurface',
    })
    return true
  }

  function reorderSurfaceTab(tabId: string, targetIndex: number) {
    const fromIndex = surfaces.findIndex((surface) => {
      const state = editorSurfaceSerializedState(surface)
      return state?.editorTabId === tabId
    })
    if (fromIndex < 0) return false

    onDispatch({
      fromIndex,
      toIndex: targetIndex,
      type: 'reorderSurface',
      windowId: window.id,
    })
    return true
  }

  function selectEditorTab(tab: (typeof editorTabs)[number]) {
    const surfaceId = editorSurfaceContext?.surfaceIdForEditorTabId(tab.id)
    if (!surfaceId) return

    onDispatch({
      surfaceId,
      type: 'activateSurface',
      windowId: window.id,
    })
  }

  function splitEditorTab(tabId: string, direction: 'horizontal' | 'vertical') {
    const surfaceId = editorSurfaceContext?.surfaceIdForEditorTabId(tabId)
    if (!surfaceId) return false

    onDispatch({
      edge: direction === 'horizontal' ? 'right' : 'bottom',
      surfaceId,
      type: 'splitWindow',
      windowId: window.id,
    })
    return true
  }
}

function selectSurfaceOperation(window: WorkbenchWindow, surface: Surface): LayoutOperation {
  return {
    surfaceId: surface.id,
    type: 'activateSurface',
    windowId: window.id,
  }
}
