import type {
  FileTreeContextMenuItem,
  FileTreeContextMenuOpenContext,
} from '@workspace/tree/utils/model/publicTypes'
import type { GitStatusEntry } from '@workspace/tree/utils/publicTypes'

import { rowHasGitChanges, treeRowMenu } from '@/components/workspace/file-tree/utils/row-menu'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import {
  useDiscardPathsMutation,
  useStagePathsMutation,
  useUnstagePathsMutation,
} from '@/features/git/hooks'
import { MenuSurface } from '@/features/menus/components/surface'
import { rectAnchor } from '@/features/menus/utils/virtual-anchor'
import { copyTextToClipboard } from '@/lib/clipboard'
import { entryForTreePath, type TreeModel } from '@/lib/tree-model'

/**
 * Mounted by the tree only while its menu is open, so the git mutation hooks
 * can bake in this row's path at render time.
 */
export function TreeRowMenu({
  gitStatus,
  item,
  menuContext,
  model,
}: {
  readonly gitStatus?: readonly GitStatusEntry[]
  readonly item: FileTreeContextMenuItem
  readonly menuContext: FileTreeContextMenuOpenContext
  readonly model: TreeModel
}) {
  const isDirectory = item.kind === 'directory'
  const path = entryForTreePath(model, item.path)?.path ?? null
  const paths = path ? [path] : []
  const discard = useDiscardPathsMutation(paths)
  const stage = useStagePathsMutation(paths)
  const unstage = useUnstagePathsMutation(paths)
  const { selectFile } = useEditorCommands()

  const menu = treeRowMenu({
    copyPath: (value, label) => void copyTextToClipboard(value, label),
    discard: () => discard.mutate(),
    hasGitChanges: rowHasGitChanges(gitStatus, item.path, isDirectory),
    isDirectory,
    openFile: () => selectFile(path),
    path,
    relativePath: item.path,
    stage: () => stage.mutate(),
    unstage: () => unstage.mutate(),
  })

  return (
    <MenuSurface
      anchor={rectAnchor(menuContext.anchorRect)}
      className='w-56'
      menu={menu}
      // Base UI owns dismissal; closing here unmounts us via the tree.
      onOpenChange={(next) => next || menuContext.close({ restoreFocus: true })}
      open
      // The popup portals to <body>; without this the tree's composedPath
      // outside-click check would treat our own items as outside clicks.
      popupProps={{ 'data-file-tree-context-menu-root': 'true' }}
      surface='files.row'
    />
  )
}
