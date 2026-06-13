/* eslint-disable oxc-react-compiler/refs -- DEFERRED (see handoff): reading the `dragHandleRef` callback-ref prop during render to gate styling/markup makes the React Compiler bail on ToolPaneHeader. Proper fix is an explicit `draggable` boolean prop so the ref is only ever attached, never read in render. */
import { DotsSixVerticalIcon, MinusIcon, PlusIcon, XIcon } from '@phosphor-icons/react'

import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'
import { SurfaceIcon } from '@/features/workbench/components/surface-icon'
import type { LoadState } from '@/lib/load-state'
import type { TreeModel } from '@/lib/tree-model'
import type { Surface, SurfaceType } from '@workspace/tiling/utils/layout-types'
import type { PointerEvent } from 'react'

type ToolPaneHeaderOrientation = 'horizontal' | 'vertical'
type ToolPaneHeaderTab = 'chat' | 'files' | 'git' | 'logs' | 'search'

export function ToolPaneHeader({
  className,
  collapsed = false,
  dragHandleRef,
  orientation = 'horizontal',
  railActive = false,
  rowActive = false,
  surface,
  tab,
  treeState,
  visibleTreeItemCount,
  onClose,
  onCollapseToRail,
  onCollapseToRow,
  onToggleCollapse,
}: {
  readonly className?: string
  readonly collapsed?: boolean
  readonly dragHandleRef?: (element: HTMLElement | null) => void
  readonly orientation?: ToolPaneHeaderOrientation
  readonly railActive?: boolean
  readonly rowActive?: boolean
  readonly surface?: Surface | null
  readonly tab?: ToolPaneHeaderTab
  readonly treeState?: LoadState<TreeModel>
  readonly visibleTreeItemCount?: number | null
  readonly onClose?: () => void
  readonly onCollapseToRail?: () => void
  readonly onCollapseToRow?: () => void
  readonly onToggleCollapse?: () => void
}) {
  const title = toolPaneHeaderTitle(surface, tab)
  const detail =
    tab === 'files' && orientation === 'horizontal'
      ? treeHeaderDetail(treeState, visibleTreeItemCount ?? null)
      : null
  const surfaceType = surface?.type ?? toolPaneHeaderSurfaceType(tab)
  const toggleLabel = collapsed ? `Expand ${title}` : `Collapse ${title}`
  const dualCollapseVisible = Boolean(onCollapseToRow && onCollapseToRail)
  const rowLabel = rowActive ? `Expand ${title}` : `Collapse ${title} to row`
  const railLabel = railActive ? `Expand ${title}` : `Collapse ${title} to rail`
  const actionsVisible = Boolean(onClose || onToggleCollapse || dualCollapseVisible)

  return (
    <div
      className={cn(
        'border-border flex shrink-0 bg-card text-foreground',
        orientation === 'vertical'
          ? 'h-full w-full flex-col items-center gap-1 border-r px-1 py-1'
          : 'h-10 items-center gap-2 border-b px-3',
        dragHandleRef && 'cursor-grab active:cursor-grabbing',
        className,
      )}
      data-workbench-window-drag-handle={dragHandleRef ? '' : undefined}
      data-workbench-tool-pane-drag-handle={dragHandleRef ? '' : undefined}
      data-workbench-tool-pane-header=''
      data-workbench-tool-pane-header-collapsed={collapsed ? 'true' : 'false'}
      data-workbench-tool-pane-header-orientation={orientation}
      ref={dragHandleRef}
    >
      {dragHandleRef ? (
        <div
          aria-label={`Drag ${title}`}
          className={cn(
            'text-muted-foreground grid shrink-0 place-items-center text-sm',
            orientation === 'vertical' ? 'h-7 w-8' : 'h-8 w-5',
          )}
          role='button'
          tabIndex={0}
        >
          <DotsSixVerticalIcon className='size-3.5' />
        </div>
      ) : null}
      {surfaceType ? (
        <SurfaceIcon
          className={cn(
            'text-muted-foreground shrink-0',
            orientation === 'vertical' ? 'size-4' : 'size-4',
          )}
          type={surfaceType}
        />
      ) : null}
      <div
        className={cn(
          'min-w-0 flex-1',
          orientation === 'vertical' && 'flex min-h-0 w-full flex-col items-center',
        )}
      >
        <div
          className={cn(
            'truncate text-xs font-medium',
            orientation === 'vertical' && 'min-h-0 [writing-mode:vertical-rl]',
          )}
        >
          {title}
        </div>
        {detail ? (
          <div className='text-muted-foreground truncate text-[11px] tabular-nums'>{detail}</div>
        ) : null}
      </div>
      {actionsVisible ? (
        <div
          className={cn(
            'flex shrink-0 items-center gap-0.5',
            orientation === 'vertical' ? 'w-full flex-col' : 'ml-auto',
          )}
          data-workbench-drag-blocker=''
        >
          {dualCollapseVisible ? (
            <>
              <Button
                aria-label={rowLabel}
                className='text-muted-foreground hover:text-foreground size-7 rounded-md'
                size='icon-sm'
                title={rowLabel}
                type='button'
                variant='ghost'
                onClick={rowActive ? onToggleCollapse : onCollapseToRow}
                onPointerDown={stopToolPaneHeaderPointerDown}
              >
                <MinusIcon className='size-3.5' />
              </Button>
              <Button
                aria-label={railLabel}
                className='text-muted-foreground hover:text-foreground size-7 rounded-md'
                size='icon-sm'
                title={railLabel}
                type='button'
                variant='ghost'
                onClick={railActive ? onToggleCollapse : onCollapseToRail}
                onPointerDown={stopToolPaneHeaderPointerDown}
              >
                <MinusIcon className='size-3.5 rotate-90' />
              </Button>
            </>
          ) : null}
          {!dualCollapseVisible && onToggleCollapse ? (
            <Button
              aria-label={toggleLabel}
              className='text-muted-foreground hover:text-foreground size-7 rounded-md'
              size='icon-sm'
              title={toggleLabel}
              type='button'
              variant='ghost'
              onClick={onToggleCollapse}
              onPointerDown={stopToolPaneHeaderPointerDown}
            >
              {collapsed ? <PlusIcon className='size-3.5' /> : <MinusIcon className='size-3.5' />}
            </Button>
          ) : null}
          {onClose ? (
            <Button
              aria-label={`Close ${title}`}
              className='text-muted-foreground hover:text-foreground size-7 rounded-md'
              size='icon-sm'
              title={`Close ${title}`}
              type='button'
              variant='ghost'
              onClick={onClose}
              onPointerDown={stopToolPaneHeaderPointerDown}
            >
              <XIcon className='size-3.5' />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function stopToolPaneHeaderPointerDown(event: PointerEvent<HTMLButtonElement>) {
  event.stopPropagation()
}

function toolPaneHeaderTitle(
  surface: Surface | null | undefined,
  tab: ToolPaneHeaderTab | undefined,
) {
  if (surface) return surface.title

  return panelTabTitle(tab)
}

function toolPaneHeaderSurfaceType(tab: ToolPaneHeaderTab | undefined): SurfaceType | null {
  if (tab === 'chat') return 'chat'
  if (tab === 'files') return 'file-navigator'
  if (tab === 'git') return 'git-changes'
  if (tab === 'logs') return 'logs'
  if (tab === 'search') return 'search-results'

  return null
}

function panelTabTitle(tab: ToolPaneHeaderTab | undefined) {
  if (tab === 'chat') return 'Chat'
  if (tab === 'files') return 'Files'
  if (tab === 'git') return 'Source Control'
  if (tab === 'logs') return 'Logs'
  if (tab === 'search') return 'Search'

  return 'Tool Pane'
}

function treeHeaderDetail(
  treeState: LoadState<TreeModel> | undefined,
  visibleTreeItemCount: number | null,
) {
  if (!treeState) return null
  if (treeState.status === 'loading') return 'Loading...'
  if (treeState.status === 'error') return 'Unable to load files'
  if (visibleTreeItemCount === null) return null

  return `${visibleTreeItemCount} items`
}
