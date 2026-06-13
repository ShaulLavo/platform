import { useDroppable } from '@dnd-kit/react'
import { useRef } from 'react'

import { useChromeVisualTabs } from '@/components/workspace/editor-tabs/hooks/use-chrome-visual-tabs'
import { useEditorTabIntentPrefetch } from '@/components/workspace/editor-tabs/hooks/use-editor-tab-intent-prefetch'
import { Tab } from '@/features/workbench/components/tab'
import { TabContextMenuContent } from '@/features/workbench/components/tab-context-menu-content'
import { TabPreview } from '@/features/workbench/components/tab-preview'
import { useEditorSurfaceContext } from '@/features/workbench/hooks/use-editor-surface-context'
import {
  sameWorkbenchTabModel,
  workbenchTabModel,
  type WorkbenchTabModel,
} from '@/features/workbench/utils/tab-model'
import {
  chromeTabCloseBurstTargetId,
  chromeTabCloseTargetAfterClosingTab,
} from '@/components/workspace/editor-tabs/utils/editor-tab-close-retarget'
import {
  TILING_TAB_TYPE,
  TILING_WINDOW_TYPE,
  tabStripDropId,
  type TilingDragData,
  type TilingDropData,
} from '@workspace/tiling/utils/drag-data'
import {
  tilingTabStripPreviewItems,
  type TilingInsertionPreview,
} from '@workspace/tiling/utils/tab-preview'
import type {
  Surface,
  SurfaceId,
  WorkbenchWindow,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'
import { tilingTabStripAttributes } from '@workspace/tiling/utils/dom-attributes'
import { cn } from '@workspace/ui/lib/utils'

export function TabStrip({
  activeDrag,
  actionsVisible = true,
  insertionPreview,
  insertionPreviewLayout,
  dropZonesVisible,
  interactive = true,
  optimisticSorting,
  orientation,
  surfaces,
  window,
  onCloseSurface,
  onSelectSurface,
}: {
  readonly activeDrag: TilingDragData | null
  readonly actionsVisible?: boolean
  readonly dropZonesVisible: boolean
  readonly insertionPreview: TilingInsertionPreview | null
  readonly insertionPreviewLayout: WorkspaceLayout
  // False inside a preview-only window: the strip and its tabs render but stay
  // out of the drag system so the snapped-out preview can't capture drops.
  readonly interactive?: boolean
  readonly optimisticSorting: boolean
  readonly orientation: 'horizontal' | 'vertical'
  readonly surfaces: readonly Surface[]
  readonly window: WorkbenchWindow
  readonly onCloseSurface: (surfaceId: SurfaceId) => void
  readonly onSelectSurface: (surfaceId: SurfaceId) => void
}) {
  const tabListRef = useRef<HTMLDivElement | null>(null)
  const editorSurfaceContext = useEditorSurfaceContext()
  const data: TilingDropData = {
    index: surfaces.length,
    kind: 'tab-strip',
    windowId: window.id,
  }
  const { isDropTarget, ref } = useDroppable<TilingDropData>({
    accept: tabStripAcceptedTypes(activeDrag),
    data,
    disabled: !interactive || (activeDrag?.kind === 'window' && activeDrag.windowId === window.id),
    id: tabStripDropId(window.id),
  })
  const previewActive = insertionPreview?.targetWindowId === window.id
  const items = tilingTabStripPreviewItems({
    insertionPreview,
    layout: insertionPreviewLayout,
    surfaces,
    windowId: window.id,
  })
  const tabDropsAccepted = activeTabCanSortInStrip(activeDrag, surfaces)
  const tabSortingEnabled =
    optimisticSorting && orientation === 'horizontal' && !insertionPreview && tabDropsAccepted
  const tabModels = surfaces.map((surface) =>
    workbenchTabModelForSurface(surface, {
      editorSurfaceContext,
      window,
    }),
  )
  const visualTabs = useChromeVisualTabs(
    tabModels,
    true,
    sameWorkbenchTabModel,
    `workbench-tab-strip:${window.id}`,
  )
  const closeBurstTargetId = chromeTabCloseBurstTargetId(visualTabs)
  const empty = insertionPreview ? items.length === 0 : visualTabs.length === 0

  useEditorTabIntentPrefetch({
    enabled: interactive,
    tabListRef,
    tabs: tabModels.flatMap((tab) => (tab.editorTab ? [tab.editorTab] : [])),
  })

  function setTabStripElement(element: HTMLDivElement | null) {
    tabListRef.current = element
    ref(element)
  }

  return (
    <div
      aria-label='Window tabs'
      aria-orientation={orientation}
      className={cn(
        'flex min-h-0 min-w-0 flex-1 gap-1 border-border',
        orientation === 'vertical'
          ? 'w-full flex-col items-center overflow-x-hidden overflow-y-auto py-1'
          : 'min-h-10 items-end overflow-x-auto border-b px-2 pt-2',
        dropZonesVisible && isDropTarget && 'bg-info/10',
      )}
      data-workbench-tab-strip-orientation={orientation}
      data-workbench-tab-strip-id={window.id}
      data-workbench-tab-strip-preview={previewActive ? insertionPreview.kind : undefined}
      {...tilingTabStripAttributes({ orientation, windowId: window.id })}
      ref={setTabStripElement}
      role='tablist'
    >
      {insertionPreview
        ? items.map((item) => {
            if (item.kind === 'ghost') {
              return <TabPreview key={item.key} orientation={orientation} surface={item.surface} />
            }

            const tab = workbenchTabModelForSurface(item.surface, {
              editorSurfaceContext,
              window,
            })
            return (
              <Tab
                acceptsTabDrops={tabDropsAccepted}
                actionsVisible={actionsVisible}
                closeTarget={null}
                contextMenuContent={
                  interactive ? (
                    <TabContextMenuContent
                      tab={tab}
                      tabs={tabModels}
                      onCloseSurface={onCloseSurface}
                    />
                  ) : undefined
                }
                dropZonesVisible={dropZonesVisible}
                index={item.index}
                interactive={interactive}
                key={item.key}
                optimisticSorting={tabSortingEnabled}
                orientation={orientation}
                phase='present'
                previewAdded={surfaceIsPreviewAdded(insertionPreview, window.id, item.surface.id)}
                tab={tab}
                windowId={window.id}
                onClose={onCloseSurface}
                onSelect={onSelectSurface}
              />
            )
          })
        : visualTabs.map((visualTab, index) => {
            const tab = visualTab.tab
            const closeTarget = closeTargetForVisualTab(visualTabs, visualTab, closeBurstTargetId)
            return (
              <Tab
                acceptsTabDrops={visualTab.phase !== 'closing' && tabDropsAccepted}
                actionsVisible={actionsVisible}
                closeTarget={closeTarget}
                contextMenuContent={
                  interactive && visualTab.phase !== 'closing' ? (
                    <TabContextMenuContent
                      tab={tab}
                      tabs={tabModels}
                      onCloseSurface={onCloseSurface}
                    />
                  ) : undefined
                }
                dropZonesVisible={dropZonesVisible}
                index={index}
                interactive={interactive && visualTab.phase !== 'closing'}
                key={tab.id}
                optimisticSorting={tabSortingEnabled}
                orientation={orientation}
                phase={visualTab.phase}
                previewAdded={false}
                tab={tab}
                windowId={window.id}
                onClose={onCloseSurface}
                onSelect={onSelectSurface}
              />
            )
          })}
      {empty ? (
        <div
          className={cn(
            'text-muted-foreground flex items-center justify-center text-xs',
            orientation === 'vertical' ? 'h-16 w-full [writing-mode:vertical-rl]' : 'h-9 px-3',
          )}
        >
          Drop tab here
        </div>
      ) : null}
    </div>
  )
}

function workbenchTabModelForSurface(
  surface: Surface,
  {
    editorSurfaceContext,
    window,
  }: {
    readonly editorSurfaceContext: ReturnType<typeof useEditorSurfaceContext>
    readonly window: WorkbenchWindow
  },
) {
  const active = surface.id === window.activeSurfaceId
  return workbenchTabModel({
    active,
    editorTab: editorSurfaceContext.tabModelForSurface(surface, active),
    surface,
    windowId: window.id,
  })
}

function closeTargetForVisualTab(
  visualTabs: ReturnType<typeof useChromeVisualTabs<WorkbenchTabModel>>,
  visualTab: ReturnType<typeof useChromeVisualTabs<WorkbenchTabModel>>[number],
  closeBurstTargetId: WorkbenchTabModel['id'] | null,
) {
  if (closeBurstTargetId === visualTab.tab.id) return visualTab.tab.id
  if (visualTab.phase !== 'closing') return null

  return chromeTabCloseTargetAfterClosingTab(visualTabs, visualTab.tab.id)
}

function activeTabCanSortInStrip(activeDrag: TilingDragData | null, surfaces: readonly Surface[]) {
  if (activeDrag?.kind !== 'tab') return true

  return surfaces.some((surface) => surface.id === activeDrag.surfaceId)
}

function tabStripAcceptedTypes(activeDrag: TilingDragData | null) {
  if (activeDrag?.kind === 'tab') return [TILING_WINDOW_TYPE]

  return [TILING_TAB_TYPE, TILING_WINDOW_TYPE]
}

function surfaceIsPreviewAdded(
  insertionPreview: TilingInsertionPreview | null,
  windowId: WorkbenchWindow['id'],
  surfaceId: SurfaceId,
) {
  if (insertionPreview?.kind !== 'window-merge') return false
  if (insertionPreview.targetWindowId !== windowId) return false

  return insertionPreview.sourceSurfaceIds.includes(surfaceId)
}
