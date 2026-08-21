// What has to be true before a command can run — shared by the palette, the menus, and the keymap tests.
import {
  editorBackedDocumentPath,
  fileBackedDocumentPath,
  savableDocumentPath,
} from '@/features/editor/utils/file-backed-document'
import { commandRequirement } from '@/keymap/table'
import type { PlatformCommandId } from '@/keymap/types'

export type CommandDisabledContext = {
  readonly activeFilePath: string | null
  readonly hasWorkspace: boolean
}

export function isCommandDisabled(command: PlatformCommandId, context: CommandDisabledContext) {
  return commandDisabledReason(command, context) !== null
}

// Widest requirement first: each branch is the one below it plus a condition, so falling through
// them in order is what makes `file` imply `editor` imply `tab` without restating any of it.
export function commandDisabledReason(command: PlatformCommandId, context: CommandDisabledContext) {
  const requires = commandRequirement(command)
  if (requires === 'nothing') return null
  if (!context.hasWorkspace) return 'No workspace open.'
  if (requires === 'workspace') return null
  if (requires === 'tab') return context.activeFilePath ? null : 'No editor tab is open.'
  if (requires === 'editor') {
    return editorBackedDocumentPath(context.activeFilePath) ? null : 'No text editor is active.'
  }
  if (requires === 'saveable') {
    return savableDocumentPath(context.activeFilePath) ? null : 'Nothing here can be saved.'
  }

  return fileBackedDocumentPath(context.activeFilePath) ? null : 'No file-backed surface is active.'
}
