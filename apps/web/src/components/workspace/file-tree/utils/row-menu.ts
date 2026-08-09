import {
  ArrowCounterClockwiseIcon,
  CopyIcon,
  FileArrowUpIcon,
  FileArrowDownIcon,
  FolderOpenIcon,
} from '@phosphor-icons/react'

import type { GitStatusEntry } from '@workspace/tree/utils/publicTypes'

import { actionItem, section, type Menu } from '@/features/menus/utils/model'

/**
 * A directory counts as changed when anything beneath it is, matching what the
 * row's own git decoration already shows. Ignored files never count — git
 * actions on them are noise.
 */
export function rowHasGitChanges(
  gitStatus: readonly GitStatusEntry[] | undefined,
  treePath: string,
  isDirectory: boolean,
) {
  if (!gitStatus?.length) return false

  const prefix = `${treePath}/`

  return gitStatus.some((entry) => {
    if (entry.status === 'ignored') return false
    if (entry.path === treePath) return true

    return isDirectory && entry.path.startsWith(prefix)
  })
}

export type TreeRowMenuContext = {
  readonly copyPath: (path: string, label: string) => void
  readonly discard: () => void
  /** False when the row has nothing to stage, so the git section is omitted. */
  readonly hasGitChanges: boolean
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
    // Omitted entirely for unchanged rows: staging a file with nothing to
    // stage is not a disabled action, it is a meaningless one.
    section('git', [
      context.hasGitChanges &&
        actionItem({
          disabled: context.path === null,
          icon: FileArrowUpIcon,
          id: 'stage',
          label: 'Stage Changes',
          run: context.stage,
        }),
      context.hasGitChanges &&
        actionItem({
          disabled: context.path === null,
          icon: FileArrowDownIcon,
          id: 'unstage',
          label: 'Unstage Changes',
          run: context.unstage,
        }),
      context.hasGitChanges &&
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
