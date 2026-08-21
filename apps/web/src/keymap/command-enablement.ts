// What has to be true before a command can run — shared by the palette, the menus, and the keymap tests.
import { fileBackedDocumentPath } from '@/features/editor/utils/file-backed-document'
import { commandRequirement } from '@/keymap/table'
import type { PlatformCommandId } from '@/keymap/types'

export type CommandDisabledContext = {
  readonly activeFilePath: string | null
  readonly hasWorkspace: boolean
}

export function isCommandDisabled(command: PlatformCommandId, context: CommandDisabledContext) {
  return commandDisabledReason(command, context) !== null
}

export function commandDisabledReason(command: PlatformCommandId, context: CommandDisabledContext) {
  const requires = commandRequirement(command)
  if (requires === 'nothing') return null
  if (!context.hasWorkspace) return 'No workspace open.'
  if (requires === 'workspace') return null

  return fileBackedDocumentPath(context.activeFilePath) ? null : 'No file-backed surface is active.'
}
