import type { ReactElement } from 'react'
import { ArrowRightIcon, CopyIcon, FilesIcon, FloppyDiskIcon, XIcon } from '@phosphor-icons/react'
import { toast } from 'sonner'

import {
  editorTabCloseTargetIds,
  type EditorTabCloseTarget,
  type EditorTabCloseTargetKind,
} from '@/components/workspace/editor-tabs/utils/editor-tab-close-targets'
import type { EditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import { useEditorTabActions } from '@/features/editor/hooks/use-editor-tab-actions'
import { log } from '@/lib/client-logging'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@workspace/ui/components/context-menu'

export function EditorTabContextMenu({
  closeTargets,
  tab,
  trigger,
}: {
  readonly closeTargets: readonly EditorTabCloseTarget[]
  readonly tab: EditorTabModel
  readonly trigger: ReactElement
}) {
  const { requestCloseTabs } = useEditorTabActions()

  function handleClose(kind: EditorTabCloseTargetKind) {
    const tabIds = editorTabCloseTargetIds(closeTargets, tab.id, kind)
    if (tabIds.length === 0) return

    requestCloseTabs(tabIds)
  }

  function handleCopyPath(path: string, label: string) {
    void copyTextToClipboard(path, label)
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger render={trigger} />
      <ContextMenuContent className='w-52'>
        <ContextMenuItem onClick={() => handleClose('close')}>
          <XIcon />
          <span>Close</span>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={closeActionDisabled(closeTargets, tab.id, 'closeOthers')}
          onClick={() => handleClose('closeOthers')}
        >
          <FilesIcon />
          <span>Close Others</span>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={closeActionDisabled(closeTargets, tab.id, 'closeToRight')}
          onClick={() => handleClose('closeToRight')}
        >
          <ArrowRightIcon />
          <span>Close to the Right</span>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={closeActionDisabled(closeTargets, tab.id, 'closeSaved')}
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
        <ContextMenuItem onClick={() => handleCopyPath(tab.copyPath, 'path')}>
          <CopyIcon />
          <span>Copy Path</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => handleCopyPath(tab.copyRelativePath, 'relative path')}>
          <CopyIcon />
          <span>Copy Relative Path</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function closeActionDisabled(
  closeTargets: readonly EditorTabCloseTarget[],
  tabId: string,
  kind: EditorTabCloseTargetKind,
) {
  return editorTabCloseTargetIds(closeTargets, tabId, kind).length === 0
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
    log.warn({
      action: 'editor_tab.copy_path_failed',
      area: 'editor',
      error,
      label,
    })
    toast.error(`Could not copy ${label}`)
  }
}
