import {
  ArrowBendUpLeftIcon,
  CopyIcon,
  FileIcon,
  GitDiffIcon,
  MinusIcon,
  PlusIcon,
} from '@phosphor-icons/react'

import { actionItem, section, type Menu } from '@/features/menus/utils/model'

import type { PanelSection } from '@/features/git/utils/types'

export type FileMenuContext = {
  readonly copyPath: (value: string, label: string) => void
  /** Unstage-then-discard for a staged row, a plain discard for a worktree one. */
  readonly discard: () => void
  /** A deleted row has no file left on disk to open. */
  readonly onDisk: boolean
  readonly openDiff: () => void
  readonly openFile: () => void
  /** Absolute path on disk. */
  readonly path: string
  readonly relativePath: string
  readonly section: PanelSection
  readonly stage: () => void
  readonly unstage: () => void
}

/**
 * The right-click twin of the row's hover buttons, split the same way they
 * are: a staged row cannot be staged again, and discarding it drops the index
 * entry as well as the worktree change.
 */
export function fileMenu(context: FileMenuContext): Menu {
  const staged = context.section === 'staged'

  return [
    section('open', [
      actionItem({
        icon: GitDiffIcon,
        id: 'openChanges',
        label: 'Open Changes',
        run: context.openDiff,
      }),
      actionItem({
        disabled: !context.onDisk,
        icon: FileIcon,
        id: 'openFile',
        label: 'Open File',
        run: context.openFile,
      }),
    ]),
    section('stage', [
      !staged &&
        actionItem({
          icon: PlusIcon,
          id: 'stage',
          label: 'Stage Changes',
          run: context.stage,
        }),
      staged &&
        actionItem({
          icon: MinusIcon,
          id: 'unstage',
          label: 'Unstage Changes',
          run: context.unstage,
        }),
      actionItem({
        destructive: true,
        icon: ArrowBendUpLeftIcon,
        id: 'discard',
        label: discardLabel(staged),
        run: context.discard,
      }),
    ]),
    section('copy', [
      actionItem({
        icon: CopyIcon,
        id: 'copyPath',
        label: 'Copy Path',
        run: () => context.copyPath(context.path, 'path'),
      }),
      actionItem({
        icon: CopyIcon,
        id: 'copyRelativePath',
        label: 'Copy Relative Path',
        run: () => context.copyPath(context.relativePath, 'relative path'),
      }),
    ]),
  ]
}

function discardLabel(staged: boolean) {
  if (staged) return 'Discard Staged Changes'

  return 'Discard Changes'
}
