import { ArrowRightIcon, CopyIcon, FilesIcon, FloppyDiskIcon, XIcon } from '@phosphor-icons/react'

import {
  editorTabCloseTargetIds,
  type EditorTabCloseTarget,
  type EditorTabCloseTargetKind,
} from '@/components/workspace/editor-tabs/utils/editor-tab-close-targets'
import type { EditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import { actionItem, section, type Menu } from '@/features/menus/utils/model'

export type EditorTabMenuContext = {
  readonly closeTargets: readonly EditorTabCloseTarget[]
  readonly copyPath: (path: string, label: string) => void
  readonly closeTabs: (tabIds: readonly string[]) => void
  readonly tab: EditorTabModel
}

export function editorTabMenu(context: EditorTabMenuContext): Menu {
  return [
    section('close', [
      closeAction(context, 'close', 'Close', XIcon),
      closeAction(context, 'closeOthers', 'Close Others', FilesIcon),
      closeAction(context, 'closeToRight', 'Close to the Right', ArrowRightIcon),
      closeAction(context, 'closeSaved', 'Close Saved', FloppyDiskIcon),
      closeAction(context, 'closeAll', 'Close All', XIcon),
    ]),
    section('copy', [
      actionItem({
        icon: CopyIcon,
        id: 'copyPath',
        label: 'Copy Path',
        run: () => context.copyPath(context.tab.copyPath, 'path'),
      }),
      actionItem({
        icon: CopyIcon,
        id: 'copyRelativePath',
        label: 'Copy Relative Path',
        run: () => context.copyPath(context.tab.copyRelativePath, 'relative path'),
      }),
    ]),
  ]
}

function closeAction(
  context: EditorTabMenuContext,
  kind: EditorTabCloseTargetKind,
  label: string,
  icon: typeof XIcon,
) {
  const tabIds = editorTabCloseTargetIds(context.closeTargets, context.tab.id, kind)

  return actionItem({
    disabled: tabIds.length === 0,
    icon,
    id: kind,
    label,
    run: () => context.closeTabs(tabIds),
  })
}
