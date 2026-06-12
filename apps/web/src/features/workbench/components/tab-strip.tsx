import { use, useMemo, useRef, type ContextType } from 'react'

import { ChromeEditorTabList } from '@/components/workspace/editor-tabs/components/chrome-editor-tab-list'
import { ChromeTabCloseButton } from '@/components/workspace/editor-tabs/components/chrome-tab-close-button'
import { chromeTabLayout } from '@/components/workspace/editor-tabs/utils/chrome-tab-layout'
import { ChromeTabSelectButton } from '@/components/workspace/editor-tabs/components/chrome-tab-select-button'
import type { EditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import { sameEditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-model'
import {
  primeChromeVisualTabsCache,
  useChromeVisualTabs,
} from '@/components/workspace/editor-tabs/hooks/use-chrome-visual-tabs'
import { useElementWidth } from '@/components/workspace/shared/hooks/use-element-width'
import { cn } from '@workspace/ui/lib/utils'

import { WorkbenchChromeTab } from '@/features/workbench/components/chrome-tab'
import { surfacePanelId } from '@/features/workbench/components/surface-host'
import { SurfaceIcon } from '@/features/workbench/components/surface-icon'
import { editorGroupIdForWorkbenchWindowId } from '@/features/workbench/utils/editor-surface-layout'
import { EditorSurfaceContext } from '@/features/workbench/providers/editor-surface-context'
import { chromeTabStyle } from '@/features/workbench/utils/tab-style'
import {
  WORKBENCH_TAB_DRAG_TYPE,
  workbenchTabCapabilities,
  type WorkbenchTabDragData,
} from '@/features/workbench/utils/drag-drop-data'
import type {
  LayoutOperation,
  Surface,
  WorkbenchWindow,
} from '@workspace/tiling/utils/layout-types'

export function TabStrip({
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
  const editorSurfaceContext = use(EditorSurfaceContext)
  const editorGroupId = editorGroupIdForWorkbenchWindowId(window.id) ?? String(window.id)
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
    editorGroupId,
  )
  const availableWidth = useElementWidth(tabListRef)
  const activeIndex = surfaces.findIndex((surface) => surface.id === window.activeSurfaceId)
  const editorTabDndById = editorSurfaceContext
    ? editorTabDragDataById({
        editorSurfaceContext,
        editorTabs,
        stripId: editorGroupId,
        surfaces,
        window,
      })
    : new Map<string, WorkbenchTabDragData>()
  const layout =
    availableWidth === null
      ? null
      : chromeTabLayout({
          activeIndex,
          availableWidth,
          tabCount: surfaces.length,
        })

  if (editorSurfaceContext && editorTabs.length === surfaces.length && visualTabs.length > 0) {
    return (
      <div
        aria-label='Window tabs'
        className='flex min-h-0 min-w-0 flex-1 items-end overflow-hidden'
        data-workbench-drag-blocker=''
        data-workbench-tab-strip-id={editorGroupId}
        ref={tabListRef}
        role='tablist'
      >
        <ChromeEditorTabList
          closeLayoutCacheKey={editorGroupId}
          dndByTabId={editorTabDndById}
          selectedTabRef={selectedTabRef}
          tabListRef={tabListRef}
          tabs={visualTabs}
          onBeforeClose={primeEditorTabCloseState}
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
      data-workbench-drag-blocker=''
      data-workbench-tab-strip-id={editorGroupId}
      ref={tabListRef}
      role='tablist'
    >
      <div className='flex min-w-full items-end overflow-visible'>
        {surfaces.map((surface, index) => {
          const active = surface.id === window.activeSurfaceId
          const dnd = surfaceTabDragData({
            index,
            stripId: editorGroupId,
            surface,
            window,
          })

          return (
            <WorkbenchChromeTab
              active={active}
              className='border border-transparent'
              dnd={dnd}
              key={surface.id}
              surfaceTabId={surface.id}
              style={chromeTabStyle({
                active,
                index,
                overlap: layout?.overlap ?? 0,
                width: layout?.tabs[index]?.width ?? null,
              })}
              onClick={() => onDispatch(selectSurfaceOperation(window, surface))}
            >
              <ChromeTabSelectButton
                aria-controls={surfacePanelId(surface.id)}
                aria-selected={active}
                role='tab'
                title={surface.title}
              >
                <SurfaceIcon className='size-3.5 shrink-0' type={surface.type} />
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
                  data-workbench-drag-blocker=''
                  disabled={!surface.capabilities.canClose}
                  draggable={false}
                  title={`Close ${surface.title} tab`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onDispatch({ surfaceId: surface.id, type: 'closeSurface' })
                  }}
                />
              </div>
            </WorkbenchChromeTab>
          )
        })}
      </div>
    </div>
  )

  function primeEditorTabCloseState() {
    primeChromeVisualTabsCache(editorGroupId, editorTabs, visualTabs)
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

function editorTabDragDataById({
  editorSurfaceContext,
  editorTabs,
  stripId,
  surfaces,
  window,
}: {
  readonly editorSurfaceContext: NonNullable<ContextType<typeof EditorSurfaceContext>>
  readonly editorTabs: readonly EditorTabModel[]
  readonly stripId: string
  readonly surfaces: readonly Surface[]
  readonly window: WorkbenchWindow
}) {
  const dndById = new Map<string, WorkbenchTabDragData>()
  for (let index = 0; index < editorTabs.length; index += 1) {
    const tab = editorTabs[index]
    if (!tab) continue

    const surface = editorSurfaceForTab(editorSurfaceContext, surfaces, tab.id)
    if (!surface) continue

    dndById.set(tab.id, surfaceTabDragData({ index, stripId, surface, window }))
  }

  return dndById
}

function editorSurfaceForTab(
  editorSurfaceContext: NonNullable<ContextType<typeof EditorSurfaceContext>>,
  surfaces: readonly Surface[],
  tabId: string,
) {
  const surfaceId = editorSurfaceContext.surfaceIdForEditorTabId(tabId)
  if (!surfaceId) return null

  return surfaces.find((surface) => surface.id === surfaceId) ?? null
}

function surfaceTabDragData({
  index,
  stripId,
  surface,
  window,
}: {
  readonly index: number
  readonly stripId: string
  readonly surface: Surface
  readonly window: WorkbenchWindow
}): WorkbenchTabDragData {
  return {
    capabilities: workbenchTabCapabilities({ surface }),
    dragType: WORKBENCH_TAB_DRAG_TYPE,
    sourceIndex: index,
    sourceWindowId: window.id,
    stripId,
    surfaceId: surface.id,
  }
}

function selectSurfaceOperation(window: WorkbenchWindow, surface: Surface): LayoutOperation {
  return {
    surfaceId: surface.id,
    type: 'activateSurface',
    windowId: window.id,
  }
}
