import {
  fileBackedDocumentPath,
  savableDocumentPath,
} from '@/features/editor/utils/file-backed-document'
import type { CommandTargetKind, CommandWhen } from '@/keymap/define-command'

export type CommandWhenSnapshot = {
  readonly activeFilePath: string | null
  readonly activeTabId: string | null
  readonly chatMode: boolean
  readonly workspaceOpen: boolean
}

export type CommandWhenTarget = {
  readonly kind: CommandTargetKind
  readonly writable?: boolean
}

export const commandWhenDisabledReasons = {
  chatMode: 'Chat mode is not active.',
  editorTarget: 'No text editor is active.',
  editorWritable: 'The active editor is read-only.',
  fileBackedTab: 'No file-backed surface is active.',
  saveableTab: 'Nothing here can be saved.',
  tabOpen: 'No editor tab is open.',
  workspaceOpen: 'No workspace open.',
} as const satisfies Record<CommandWhen, string>

export function commandWhenDisabledReason(
  conditions: readonly CommandWhen[],
  snapshot: CommandWhenSnapshot,
  target: CommandWhenTarget,
): string | null {
  for (const condition of conditions) {
    const reason = conditionDisabledReason(condition, snapshot, target)
    if (reason) return reason
  }

  return null
}

function conditionDisabledReason(
  condition: CommandWhen,
  snapshot: CommandWhenSnapshot,
  target: CommandWhenTarget,
): string | null {
  if (condition === 'chatMode') {
    return snapshot.chatMode ? null : commandWhenDisabledReasons.chatMode
  }
  if (condition === 'editorTarget') {
    return target.kind === 'editor' ? null : commandWhenDisabledReasons.editorTarget
  }
  if (condition === 'editorWritable') {
    return target.kind === 'editor' && target.writable
      ? null
      : commandWhenDisabledReasons.editorWritable
  }
  if (condition === 'fileBackedTab') {
    return fileBackedDocumentPath(snapshot.activeFilePath)
      ? null
      : commandWhenDisabledReasons.fileBackedTab
  }
  if (condition === 'saveableTab') {
    return savableDocumentPath(snapshot.activeFilePath)
      ? null
      : commandWhenDisabledReasons.saveableTab
  }
  if (condition === 'tabOpen') {
    return snapshot.activeTabId !== null ? null : commandWhenDisabledReasons.tabOpen
  }
  if (condition === 'workspaceOpen') {
    return snapshot.workspaceOpen ? null : commandWhenDisabledReasons.workspaceOpen
  }

  return unreachableCondition(condition)
}

function unreachableCondition(condition: never): null {
  return condition
}
