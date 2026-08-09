import type {
  FileTreeContextMenuItem,
  FileTreeContextMenuOpenContext,
} from '@workspace/tree/utils/model/publicTypes'

import { treeRowMenu } from '@/components/workspace/file-tree/utils/row-menu'
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
  item,
  menuContext,
  model,
}: {
  readonly item: FileTreeContextMenuItem
  readonly menuContext: FileTreeContextMenuOpenContext
  readonly model: TreeModel
}) {
  const path = entryForTreePath(model, item.path)?.path ?? null
  const paths = path ? [path] : []
  const discard = useDiscardPathsMutation(paths)
  const stage = useStagePathsMutation(paths)
  const unstage = useUnstagePathsMutation(paths)
  const { selectFile } = useEditorCommands()

  const menu = treeRowMenu({
    copyPath: (value, label) => void copyTextToClipboard(value, label),
    discard: () => discard.mutate(),
    isDirectory: item.kind === 'directory',
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
