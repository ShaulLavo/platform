import type { EditorTabCloseTarget } from '@/components/workspace/editor-tabs/utils/editor-tab-close-targets'
import type { EditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import { useEditorTabActions } from '@/features/editor/hooks/use-editor-tab-actions'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { editorTabMenu } from '@/features/workbench/utils/editor-tab-menu'
import { copyTextToClipboard } from '@/lib/clipboard'

export function useEditorTabMenu(
  tab: EditorTabModel,
  closeTargets: readonly EditorTabCloseTarget[],
) {
  const { requestCloseTabs } = useEditorTabActions()
  const { selectFile } = useEditorCommands()

  return editorTabMenu({
    closeTargets,
    closeTabs: (tabIds) => requestCloseTabs(tabIds),
    copyPath: (path, label) => void copyTextToClipboard(path, label),
    openFile: (path) => selectFile(path),
    tab,
  })
}
