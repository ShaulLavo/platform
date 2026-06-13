import { useSortable } from '@dnd-kit/react/sortable'
import type { ReactNode } from 'react'

import { useEditorTabDirty } from '@/components/workspace/editor-tabs/hooks/use-editor-tab-dirty'
import { TabIcon } from '@/features/workbench/components/tab-icon'
import { TabTitle } from '@/features/workbench/components/tab-title'
import { TabTrailingSlot } from '@/features/workbench/components/tab-trailing-slot'
import type { WorkbenchTabModel } from '@/features/workbench/utils/tab-model'
import {
  TILING_TAB_TYPE,
  tabDragId,
  type TilingDragData,
  type TilingDropData,
} from '@workspace/tiling/utils/drag-data'
import type { SurfaceId, WindowId } from '@workspace/tiling/utils/layout-types'
import {
  tilingTabAttributes,
  tilingTabPreviewAttributes,
} from '@workspace/tiling/utils/dom-attributes'
import { ContextMenu, ContextMenuTrigger } from '@workspace/ui/components/context-menu'
import { cn } from '@workspace/ui/lib/utils'

export function Tab({
  acceptsTabDrops,
  actionsVisible = true,
  closeTarget,
  contextMenuContent,
  dropZonesVisible,
  index,
  interactive = true,
  optimisticSorting,
  orientation,
  phase,
  previewAdded,
  tab,
  windowId,
  onClose,
  onSelect,
}: {
  readonly acceptsTabDrops: boolean
  readonly actionsVisible?: boolean
  readonly closeTarget: SurfaceId | null
  readonly contextMenuContent?: ReactNode
  readonly dropZonesVisible: boolean
  readonly index: number
  // False inside a preview-only window: the tab renders but is not a sortable
  // source or target, so the snapped-out preview never joins the drag.
  readonly interactive?: boolean
  readonly optimisticSorting: boolean
  readonly orientation: 'horizontal' | 'vertical'
  readonly phase: 'closing' | 'opening' | 'present'
  readonly previewAdded: boolean
  readonly tab: WorkbenchTabModel
  readonly windowId: WindowId
  readonly onClose: (surfaceId: SurfaceId) => void
  readonly onSelect: (surfaceId: SurfaceId) => void
}) {
  const surface = tab.surface
  const title = tab.editorTab?.title ?? surface.title
  const dirty = useEditorTabDirty(tab.editorTab?.path ?? null)
  const data: TilingDragData & TilingDropData = {
    index,
    kind: 'tab',
    surfaceId: surface.id,
    windowId,
  }
  const { handleRef, isDragSource, isDragging, isDropTarget, ref, sourceRef } = useSortable<
    TilingDragData & TilingDropData
  >({
    accept: interactive && acceptsTabDrops ? TILING_TAB_TYPE : [],
    data,
    disabled: !interactive,
    group: windowId,
    id: tabDragId(surface.id),
    index,
    plugins: optimisticSorting ? undefined : [],
    type: TILING_TAB_TYPE,
  })

  function selectSurface() {
    if (isDragging) return
    if (phase === 'closing') {
      closeRetarget()
      return
    }

    onSelect(surface.id)
  }

  function closeSurface() {
    if (phase === 'closing') {
      closeRetarget()
      return
    }

    onClose(surface.id)
  }

  function closeRetarget() {
    if (!closeTarget) return

    onClose(closeTarget)
  }

  function setTabElement(element: HTMLDivElement | null) {
    ref(element)
    handleRef(element)
    sourceRef(element)
  }

  const tabBody = (
    <>
      <TabIcon className='size-3.5 shrink-0 object-contain' tab={tab} />
      <TabTitle orientation={orientation} tab={tab} />
      {actionsVisible ? (
        <TabTrailingSlot
          active={tab.active}
          canClose={surface.capabilities.canClose}
          dirty={dirty}
          forceVisible={closeTarget === surface.id}
          orientation={orientation}
          title={title}
          onClose={closeSurface}
        />
      ) : null}
    </>
  )
  const className = cn(
    'group/proof-tab flex shrink-0 cursor-grab items-center border text-xs shadow-sm active:cursor-grabbing',
    'transition-[background-color,border-color,opacity,box-shadow]',
    orientation === 'vertical'
      ? 'h-24 w-8 flex-col gap-1 rounded-md px-1 py-2'
      : 'h-9 w-28 min-w-20 max-w-44 gap-1.5 rounded-t-md px-2',
    tab.active
      ? 'bg-background text-foreground border-border'
      : 'bg-muted/60 text-muted-foreground border-transparent hover:bg-muted',
    previewAdded && 'ring-info opacity-45 ring-2',
    isDragging && 'opacity-45',
    isDragSource && 'ring-info ring-2',
    dropZonesVisible && isDropTarget && 'bg-info/10',
    phase === 'opening' && 'opacity-0',
    phase === 'closing' && 'opacity-0',
  )

  if (!contextMenuContent) {
    return (
      <div
        aria-selected={tab.active}
        className={className}
        data-editor-tab-id={tab.editorTab?.id}
        data-editor-tab-path={tab.editorTab?.path}
        data-editor-tab-phase={phase}
        data-workbench-tab-id={surface.id}
        data-workbench-tab-preview-added={previewAdded ? 'true' : undefined}
        {...tilingTabAttributes(surface.id)}
        {...(previewAdded ? tilingTabPreviewAttributes() : null)}
        ref={setTabElement}
        role='tab'
        tabIndex={0}
        title={title}
        onClick={selectSurface}
      >
        {tabBody}
      </div>
    )
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        aria-selected={tab.active}
        className={className}
        data-editor-tab-id={tab.editorTab?.id}
        data-editor-tab-path={tab.editorTab?.path}
        data-editor-tab-phase={phase}
        data-workbench-tab-id={surface.id}
        data-workbench-tab-preview-added={previewAdded ? 'true' : undefined}
        {...tilingTabAttributes(surface.id)}
        {...(previewAdded ? tilingTabPreviewAttributes() : null)}
        ref={setTabElement}
        role='tab'
        tabIndex={0}
        title={title}
        onClick={selectSurface}
      >
        {tabBody}
      </ContextMenuTrigger>
      {contextMenuContent}
    </ContextMenu>
  )
}
