import {
  ArrowCounterClockwiseIcon,
  CopyIcon,
  FileArrowUpIcon,
  FileArrowDownIcon,
  FolderOpenIcon,
} from '@phosphor-icons/react'

import { actionItem, section, type Menu } from '@/features/menus/utils/model'

export type TreeRowMenuContext = {
  readonly copyPath: (path: string, label: string) => void
  readonly discard: () => void
  readonly isDirectory: boolean
  /** Absolute path on disk. Null when the row is not backed by a loaded entry. */
  readonly path: string | null
  readonly openFile: () => void
  readonly relativePath: string
  readonly stage: () => void
  readonly unstage: () => void
}

export function treeRowMenu(context: TreeRowMenuContext): Menu {
  return [
    section('open', [
      !context.isDirectory &&
        actionItem({
          icon: FolderOpenIcon,
          id: 'open',
          label: 'Open',
          run: context.openFile,
        }),
    ]),
    section('copy', [
      actionItem({
        disabled: context.path === null,
        icon: CopyIcon,
        id: 'copyPath',
        label: 'Copy Path',
        run: () => context.copyPath(context.path ?? '', 'path'),
      }),
      actionItem({
        icon: CopyIcon,
        id: 'copyRelativePath',
        label: 'Copy Relative Path',
        run: () => context.copyPath(context.relativePath, 'relative path'),
      }),
    ]),
    section('git', [
      actionItem({
        disabled: context.path === null,
        icon: FileArrowUpIcon,
        id: 'stage',
        label: 'Stage Changes',
        run: context.stage,
      }),
      actionItem({
        disabled: context.path === null,
        icon: FileArrowDownIcon,
        id: 'unstage',
        label: 'Unstage Changes',
        run: context.unstage,
      }),
      actionItem({
        destructive: true,
        disabled: context.path === null,
        icon: ArrowCounterClockwiseIcon,
        id: 'discard',
        label: 'Discard Changes',
        run: context.discard,
      }),
    ]),
  ]
}
