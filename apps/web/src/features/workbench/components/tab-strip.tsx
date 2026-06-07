import { use, useMemo, useRef } from 'react'

import { ChromeEditorTabList } from '@/components/workspace/editor-tabs/components/chrome-editor-tab-list'
import { ChromeTabCloseButton } from '@/components/workspace/editor-tabs/components/chrome-tab-close-button'
import { chromeTabLayout } from '@/components/workspace/editor-tabs/utils/chrome-tab-layout'
import { ChromeTabSelectButton } from '@/components/workspace/editor-tabs/components/chrome-tab-select-button'
import { chromeTabRootClassName } from '@/components/workspace/editor-tabs/utils/chrome-tab-style'
import { sameEditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-model'
import {
  primeChromeVisualTabsCache,
  useChromeVisualTabs,
} from '@/components/workspace/editor-tabs/hooks/use-chrome-visual-tabs'
import { useElementWidth } from '@/components/workspace/shared/hooks/use-element-width'
import { useEditorTabDrag } from '@/components/workspace/editor-tabs/hooks/use-editor-tab-drag'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@workspace/ui/components/context-menu'
import { cn } from '@workspace/ui/lib/utils'
import { CheckIcon } from '@phosphor-icons/react'

import { surfacePanelId } from '@/features/workbench/components/surface-host'
import { SurfaceIcon } from '@/features/workbench/components/surface-icon'
import {
  bottomPaneSurfaceVisibilityOperation,
  type BottomPaneSurfaceVisibilityItem,
} from '@/features/tiling-surface-manager/engine/bottom-pane-model'
import {
  editorGroupIdForWorkbenchWindowId,
  editorSurfaceSerializedState,
} from '@/features/workbench/utils/editor-surface-layout'
import { EditorSurfaceContext } from '@/features/workbench/providers/editor-surface-context'
import { chromeTabStyle } from '@/features/workbench/utils/tab-style'
import type {
  LayoutOperation,
  Surface,
  WorkbenchWindow,
} from '@/features/tiling-surface-manager/engine/layout-types'

export function TabStrip({
  bottomPaneSurfaceVisibilityItems = [],
  surfaces,
  window,
  onDispatch,
}: {
  readonly bottomPaneSurfaceVisibilityItems?: readonly BottomPaneSurfaceVisibilityItem[]
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
  const tabDrag = useEditorTabDrag({
    paneId: editorGroupId,
    tabs: editorTabs,
    tabListRef,
    onMoveToPane: (tabId, targetIndex) => moveSurfaceTab(tabId, targetIndex),
    onReorder: (tabId, targetIndex) => reorderSurfaceTab(tabId, targetIndex),
  })
  const availableWidth = useElementWidth(tabListRef)
  const activeIndex = surfaces.findIndex((surface) => surface.id === window.activeSurfaceId)
  const bottomPane = bottomPaneSurfaceVisibilityItems.length > 0
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
        data-window-drag-blocker=''
        ref={tabListRef}
        role='tablist'
      >
        <ChromeEditorTabList
          closeLayoutCacheKey={editorGroupId}
          drag={tabDrag}
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

  const tabListContent = (
    <div className='flex min-w-full items-end overflow-visible'>
      {surfaces.map((surface, index) => {
        const active = surface.id === window.activeSurfaceId

        return (
          <div
            className={chromeTabRootClassName({
              active,
              className: 'z-[var(--chrome-tab-z)] border border-transparent',
            })}
            data-chrome-tab-root=''
            data-surface-tab-id={surface.id}
            key={surface.id}
            style={chromeTabStyle({
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
              <SurfaceIcon className='size-3.5 shrink-0' type={surface.type} />
              <span className='min-w-0 truncate'>{surface.title}</span>
            </ChromeTabSelectButton>
            {bottomPane ? null : (
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
            )}
          </div>
        )
      })}
    </div>
  )

  if (bottomPane) {
    return (
      <ContextMenu>
        <ContextMenuTrigger
          aria-label='Window tabs'
          className='flex min-h-0 min-w-0 flex-1 items-end overflow-hidden'
          data-window-drag-blocker=''
          ref={tabListRef}
          role='tablist'
        >
          {tabListContent}
        </ContextMenuTrigger>
        <ContextMenuContent className='w-48'>
          {bottomPaneSurfaceVisibilityItems.map((item) => (
            <ContextMenuItem
              aria-checked={item.checked}
              disabled={item.disabled}
              key={item.surface.id}
              role='menuitemcheckbox'
              onClick={() => dispatchBottomPaneSurfaceVisibilityChange(item)}
            >
              <SurfaceIcon className='size-3.5' type={item.surface.type} />
              <span className='min-w-0 truncate'>{item.surface.title}</span>
              <CheckIcon
                className={cn('ml-auto size-3.5', item.checked ? 'opacity-100' : 'opacity-0')}
              />
            </ContextMenuItem>
          ))}
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  return (
    <div
      aria-label='Window tabs'
      className='flex min-h-0 min-w-0 flex-1 items-end overflow-hidden'
      data-window-drag-blocker=''
      ref={tabListRef}
      role='tablist'
    >
      {tabListContent}
    </div>
  )

  function primeEditorTabCloseState() {
    primeChromeVisualTabsCache(editorGroupId, editorTabs, visualTabs)
  }

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

  function dispatchBottomPaneSurfaceVisibilityChange(item: BottomPaneSurfaceVisibilityItem) {
    const operation = bottomPaneSurfaceVisibilityOperation(item, !item.checked)
    if (!operation) return

    onDispatch(operation)
  }
}

function selectSurfaceOperation(window: WorkbenchWindow, surface: Surface): LayoutOperation {
  return {
    surfaceId: surface.id,
    type: 'activateSurface',
    windowId: window.id,
  }
}
