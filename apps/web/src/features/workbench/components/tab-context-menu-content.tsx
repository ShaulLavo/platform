import {
  ArrowRightIcon,
  ColumnsIcon,
  CopyIcon,
  FilesIcon,
  FloppyDiskIcon,
  RowsIcon,
  XIcon,
} from '@phosphor-icons/react'
import { toast } from 'sonner'

import { editorTabCloseTargetIds } from '@/components/workspace/editor-tabs/utils/editor-tab-close-targets'
import type { EditorTabCloseTargetKind } from '@/components/workspace/editor-tabs/utils/editor-tab-close-targets'
import { useEditorDocumentState } from '@/features/editor/state/editor-document-state'
import { useEditorSurfaceContext } from '@/features/workbench/hooks/use-editor-surface-context'
import { useLayoutStoreApi } from '@/features/workbench/hooks/use-layout-store-api'
import {
  workbenchTabCloseTargets,
  type WorkbenchTabModel,
} from '@/features/workbench/utils/tab-model'
import { reportClientError } from '@/lib/client-error-reporting'
import type { SurfaceId } from '@workspace/tiling/utils/layout-types'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@workspace/ui/components/context-menu'

export function TabContextMenuContent({
  tab,
  tabs,
  onCloseSurface,
}: {
  readonly tab: WorkbenchTabModel
  readonly tabs: readonly WorkbenchTabModel[]
  readonly onCloseSurface: (surfaceId: SurfaceId) => void
}) {
  const context = useEditorSurfaceContext()
  const layoutStore = useLayoutStoreApi()
  const dirtyFilePaths = useEditorDocumentState((state) => state.dirtyFilePaths)
  const closeTargets = workbenchTabCloseTargets(tabs, dirtyFilePaths)
  const canCopyPath = tab.editorTab !== null
  const canSplit = tab.surface.capabilities.canSplit

  function handleClose(kind: EditorTabCloseTargetKind) {
    closeWorkbenchTabs(targetTabs(kind), {
      requestCloseTabs: context.requestCloseTabs,
      onCloseSurface,
    })
  }

  function closeTargetCount(kind: EditorTabCloseTargetKind) {
    return targetTabs(kind).length
  }

  function targetTabs(kind: EditorTabCloseTargetKind) {
    const targetIds = new Set(editorTabCloseTargetIds(closeTargets, tab.id, kind))
    return tabs.filter((targetTab) => {
      if (!targetIds.has(targetTab.id)) return false

      return targetTab.surface.capabilities.canClose
    })
  }

  function handleSplit(direction: 'horizontal' | 'vertical') {
    if (!canSplit) return

    layoutStore.getState().dispatchLayoutOperation({
      destination: {
        edge: direction === 'horizontal' ? 'right' : 'bottom',
        kind: 'window-edge',
        windowId: tab.windowId,
      },
      surfaceId: tab.id,
      type: 'moveSurface',
    })
  }

  function handleCopyPath(path: string | undefined, label: string) {
    if (!path) return

    void copyTextToClipboard(path, label)
  }

  return (
    <ContextMenuContent className='w-52'>
      <ContextMenuItem
        disabled={closeTargetCount('close') === 0}
        onClick={() => handleClose('close')}
      >
        <XIcon />
        <span>Close</span>
      </ContextMenuItem>
      <ContextMenuItem
        disabled={closeTargetCount('closeOthers') === 0}
        onClick={() => handleClose('closeOthers')}
      >
        <FilesIcon />
        <span>Close Others</span>
      </ContextMenuItem>
      <ContextMenuItem
        disabled={closeTargetCount('closeToRight') === 0}
        onClick={() => handleClose('closeToRight')}
      >
        <ArrowRightIcon />
        <span>Close to the Right</span>
      </ContextMenuItem>
      <ContextMenuItem
        disabled={closeTargetCount('closeSaved') === 0}
        onClick={() => handleClose('closeSaved')}
      >
        <FloppyDiskIcon />
        <span>Close Saved</span>
      </ContextMenuItem>
      <ContextMenuItem
        disabled={closeTargetCount('closeAll') === 0}
        onClick={() => handleClose('closeAll')}
      >
        <XIcon />
        <span>Close All</span>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem disabled={!canSplit} onClick={() => handleSplit('horizontal')}>
        <ColumnsIcon />
        <span>Split Right</span>
      </ContextMenuItem>
      <ContextMenuItem disabled={!canSplit} onClick={() => handleSplit('vertical')}>
        <RowsIcon />
        <span>Split Down</span>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        disabled={!canCopyPath}
        onClick={() => handleCopyPath(tab.editorTab?.copyPath, 'path')}
      >
        <CopyIcon />
        <span>Copy Path</span>
      </ContextMenuItem>
      <ContextMenuItem
        disabled={!canCopyPath}
        onClick={() => handleCopyPath(tab.editorTab?.copyRelativePath, 'relative path')}
      >
        <CopyIcon />
        <span>Copy Relative Path</span>
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

function closeWorkbenchTabs(
  tabs: readonly WorkbenchTabModel[],
  context: {
    readonly requestCloseTabs: (tabIds: readonly string[]) => boolean
    readonly onCloseSurface: (surfaceId: SurfaceId) => void
  },
) {
  const editorTabIds = editorTabIdsForTabs(tabs)
  if (editorTabIds.length > 0) {
    context.requestCloseTabs(editorTabIds)
  }

  for (const tab of tabs) {
    if (tab.editorTab) continue

    context.onCloseSurface(tab.id)
  }
}

function editorTabIdsForTabs(tabs: readonly WorkbenchTabModel[]) {
  const ids: string[] = []
  for (const tab of tabs) {
    if (!tab.editorTab) continue

    ids.push(tab.editorTab.id)
  }

  return ids
}

async function copyTextToClipboard(text: string, label: string) {
  if (!navigator.clipboard?.writeText) {
    toast.error('Clipboard is unavailable')
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    toast.success(`Copied ${label}`)
  } catch (error) {
    reportClientError({
      area: 'editor-tabs',
      cause: error,
      context: { label },
      message: `Could not copy ${label}`,
      operation: 'copy-path',
    })
    toast.error(`Could not copy ${label}`)
  }
}
