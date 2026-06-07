import {
  ArrowRightIcon,
  ColumnsIcon,
  CopyIcon,
  FilesIcon,
  FloppyDiskIcon,
  RowsIcon,
  XIcon,
} from '@phosphor-icons/react'

import {
  copyTextToClipboard,
  editorTabCloseTargets,
} from '@/components/workspace/editor-tabs/utils/editor-tab-actions-utils'
import {
  editorTabCloseTargetIds,
  type EditorTabCloseTargetKind,
} from '@/components/workspace/editor-tabs/utils/editor-tab-close-targets'
import type { EditorSplitDirection } from '@/components/workspace/editor-tabs/utils/editor-tab-model'
import type { EditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import { useEditorDocumentStoreApi } from '@/features/editor/state/editor-document-state'
import type { RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@workspace/ui/components/context-menu'

export function EditorTabContextMenuContent({
  tab,
  tabs,
  onCloseTabs,
  onSplit,
}: {
  tab: EditorTabModel
  tabs: readonly EditorTabModel[]
  onCloseTabs: RequestCloseTabs
  onSplit: (tabId: string, direction: EditorSplitDirection) => boolean
}) {
  const documentStore = useEditorDocumentStoreApi()

  function handleClose(kind: EditorTabCloseTargetKind) {
    const tabIds = editorTabCloseTargetIds(
      editorTabCloseTargets(tabs, documentStore.getState().dirtyFilePaths),
      tab.id,
      kind,
    )
    if (tabIds.length === 0) return

    onCloseTabs(tabIds)
  }

  function closeTargetCount(kind: EditorTabCloseTargetKind) {
    return editorTabCloseTargetIds(
      editorTabCloseTargets(tabs, documentStore.getState().dirtyFilePaths),
      tab.id,
      kind,
    ).length
  }

  function handleCopyPath(path: string, label: string) {
    void copyTextToClipboard(path, label)
  }

  return (
    <ContextMenuContent className='w-52'>
      <ContextMenuItem onClick={() => handleClose('close')}>
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
      <ContextMenuItem onClick={() => handleClose('closeAll')}>
        <XIcon />
        <span>Close All</span>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => onSplit(tab.id, 'horizontal')}>
        <ColumnsIcon />
        <span>Split Right</span>
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onSplit(tab.id, 'vertical')}>
        <RowsIcon />
        <span>Split Down</span>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => handleCopyPath(tab.copyPath, 'path')}>
        <CopyIcon />
        <span>Copy Path</span>
      </ContextMenuItem>
      <ContextMenuItem onClick={() => handleCopyPath(tab.copyRelativePath, 'relative path')}>
        <CopyIcon />
        <span>Copy Relative Path</span>
      </ContextMenuItem>
    </ContextMenuContent>
  )
}
