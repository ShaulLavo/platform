import {
  fileBackedDocumentPath,
  savableDocumentPath,
} from '@/features/editor/utils/file-backed-document'
import type { CommandTargetKind, CommandWhen } from '@/keymap/define-command'
import {
  editorKeyConditionMatches,
  type EditorKeyCondition,
  type EditorKeymapContext,
} from '@singapor/core/keymap'

export function editorBindingConditionsMatch(
  conditions: readonly EditorKeyCondition[] | undefined,
  context: EditorKeymapContext | null,
): boolean {
  if (!conditions?.length) return true
  if (!context) return false
  return conditions.every((condition) => editorKeyConditionMatches(condition, context))
}

export type CommandWhenSnapshot = {
  readonly activeDocumentSavable?: boolean
  readonly activeFilePath: string | null
  readonly activeTabId: string | null
  readonly chatMode: boolean
  readonly workspaceOpen: boolean
  readonly workspaceEditRedoable?: boolean
  readonly workspaceEditUndoable?: boolean
  readonly workspaceMutable?: boolean
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
  workspaceEditRedoable: 'No workspace edit can be redone.',
  workspaceEditUndoable: 'No workspace edit can be undone.',
  workspaceMutable: 'Workspace files are locked by a transaction.',
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
    const pathIsSavable = savableDocumentPath(snapshot.activeFilePath)
    const documentIsSavable = snapshot.activeDocumentSavable ?? true
    return pathIsSavable && documentIsSavable ? null : commandWhenDisabledReasons.saveableTab
  }
  if (condition === 'tabOpen') {
    return snapshot.activeTabId !== null ? null : commandWhenDisabledReasons.tabOpen
  }
  if (condition === 'workspaceOpen') {
    return snapshot.workspaceOpen ? null : commandWhenDisabledReasons.workspaceOpen
  }
  if (condition === 'workspaceEditRedoable') {
    return snapshot.workspaceEditRedoable ? null : commandWhenDisabledReasons.workspaceEditRedoable
  }
  if (condition === 'workspaceEditUndoable') {
    return snapshot.workspaceEditUndoable ? null : commandWhenDisabledReasons.workspaceEditUndoable
  }
  if (condition === 'workspaceMutable') {
    return snapshot.workspaceMutable ? null : commandWhenDisabledReasons.workspaceMutable
  }

  return unreachableCondition(condition)
}

function unreachableCondition(condition: never): null {
  return condition
}
